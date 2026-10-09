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

import { rpcClientErrorCode, testModelOutputSchema } from '@taucad/chat';
import type { RpcCall, RpcName, ToolInputValidationError } from '@taucad/chat';
import { mutatingRpcNames, rpcName, toolDescriptions, toolMode, toolName } from '@taucad/chat/constants';
import { createRpcDispatcher, writeArtifactSet } from '@taucad/chat/rpc';
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
import { geoSpecRunLineageSchema } from '@taucad/chat/schemas/tools/test-model';
import type { MachineClient } from '@taucad/runtime/machine';
import type { RuntimeTransportFacet } from '@taucad/runtime/transport';
import { sha256Bytes, sha256String } from '@taucad/utils/hash';
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
import type { MachineSettingsService } from '@taucad/types';
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
  /* Waits on the person; one ask at a time keeps their questions in order. */
  [toolName.askQuestions]: { rpc: rpcName.askQuestions, sequential: true },
  [toolName.arrangeWorkbench]: { rpc: rpcName.arrangeWorkbench, needs: 'workbench' },
};

const geospecAuthoringRecipe =
  "Selected GeoSpec API: canonical. Import describe, it, and expectGeo from 'geospec'; import loadModel from 'geospec/model'. Load with await loadModel({ file: 'main.ts' }) and assert with expectGeo(model). Assertions complete before returning.";

/**
 * Records Tau writes on the agent's behalf. The agent's own composed view keeps
 * `.tau/artifacts` and `.tau/chats` read-only, so these writes go through the
 * host's record filesystem; each handler fences its own target path.
 */
const recordRpcNames = new Set<RpcName>([
  rpcName.exportModel,
  rpcName.writeTodos,
  rpcName.askQuestions,
  rpcName.arrangeWorkbench,
]);

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
  lineage: z.array(z.object({ lineage: geoSpecRunLineageSchema })).optional(),
});

/** One path whose evaluated digest disagrees with the current filesystem bytes. */
type RevisionMismatch = {
  readonly expected: { readonly path: string; readonly digest: string };
  readonly actual: { readonly path: string; readonly digest: string };
};

/**
 * Compare consumed source graphs with the filesystem selected by this invocation.
 *
 * @param result - Raw RPC result the dispatcher returned.
 * @param fileSystem - The host's existing rooted filesystem authority.
 * @returns Every path they disagree on, one entry per path.
 */
const revisionMismatches = async (result: unknown, fileSystem: RpcFileSystem): Promise<RevisionMismatch[]> => {
  const provenance = provenanceSchema.safeParse(result).data;
  if (!provenance) {
    return [];
  }
  const closures = [
    ...(provenance.sourceRevision ? [provenance.sourceRevision] : []),
    ...(provenance.sourceRevisions ?? []),
    ...(provenance.lineage ?? []).flatMap(({ lineage }) => [
      ...lineage.modules,
      ...lineage.loads.flatMap(({ evidence }) => {
        const primary = evidence?.artifacts[0];
        return [
          ...(evidence?.sourceRevision ? [evidence.sourceRevision] : []),
          ...(evidence?.exportOptions === undefined
            ? (evidence?.artifacts ?? []).flatMap((artifact) =>
                artifact.sourcePath === undefined
                  ? []
                  : [{ files: { [artifact.sourcePath]: `sha256:${artifact.sha256}` } }],
              )
            : []),
          ...(evidence?.sourcePath !== undefined && evidence.exportOptions === undefined && primary !== undefined
            ? [{ files: { [evidence.sourcePath]: `sha256:${primary.sha256}` } }]
            : []),
        ];
      }),
    ]),
  ];
  const current = new Map<string, string>();
  for (const path of new Set(closures.flatMap((closure) => Object.keys(closure.files)))) {
    try {
      // oxlint-disable-next-line no-await-in-loop -- Hold at most one potentially large source artifact while hashing.
      current.set(path, `sha256:${await sha256Bytes(await fileSystem.readBinaryFile(path))}`);
    } catch (error) {
      current.set(path, errorCode(error) === 'ENOENT' ? 'missing' : 'unavailable');
    }
  }
  const mismatches = new Map<string, RevisionMismatch>();
  for (const closure of closures) {
    for (const [path, digest] of Object.entries(closure.files)) {
      const expected = current.get(path)!;
      if (expected !== digest) {
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
  /** Backs `use_skill`. */
  readonly skillResolver?: RpcSkillResolver | undefined;
  /** Backs the read-only `revisions` tool; a host without a revision graph omits it. */
  readonly revisions?: RpcRevisionsClient | undefined;
  /** Explicit machine tools, offered only after transport capability and route grant negotiation. */
  readonly machines?: RuntimeTransportFacet<MachineClient> | undefined;
  /**
   * The host's part of printing: the `tau.json` id of the project the agent
   * works in, which names every print artifact, and a binary read of the
   * recorded slice. `request_job` and `check_job` are offered with these and
   * an available `machines` facet; they slice a `targetFile` through the
   * registry's own `export_model` route, so without a `graphics` client they
   * run finished programs (`artifact`) only. A host that cannot name its
   * project omits this, and neither is offered.
   */
  readonly print?: Pick<MachinePrintPlannerDependencies, 'projectId' | 'readArtifact'> | undefined;
  readonly machineSettings?: Pick<MachineSettingsService, 'readMachineSettings'> | undefined;
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
        ? `${toolDescriptions[toolName.testModel]}\n\n${geospecAuthoringRecipe}`
        : toolDescriptions[entry.toolName as keyof typeof toolDescriptions],
    // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- draft-7 JSON Schema is JSON by construction.
    inputSchema: toProviderToolJsonSchema(entry.schema) as JsonObject,
    ...(rpcForTool[entry.toolName]?.sequential === true ? { executionMode: 'sequential' } : {}),
  }));

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
        content: arrange
          ? {
              success: false,
              errorCode: rpcClientErrorCode.validationError,
              message: arrangeValidationMessage(parsed.error, invocation.input),
            }
          : ({
              errorCode: 'TOOL_INPUT_VALIDATION_FAILED',
              message: z.prettifyError(parsed.error),
              toolName: invocation.toolName,
              toolCallId: invocation.toolCallId,
              validationErrors: parsed.error.issues.map((issue) => ({
                path: issue.path.join('.'),
                message: issue.message,
              })),
            } satisfies ToolInputValidationError),
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
            mapped.rpc === rpcName.exportModel || mapped.rpc === rpcName.askQuestions
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
       * Settle one dispatched result against this invocation's filesystem.
       *
       * A consumed graph that no longer matches the selected checkout gets
       * one retry through the same clients. A second mismatch or unreadable
       * input cannot certify the current files, even when an immutable
       * admitted snapshot retains valid geometry evidence for older bytes.
       * Refuse before persistence or publication of a current verdict.
       *
       * @param first - Result the first dispatch returned.
       * @returns The tool result the agent sees.
       */
      const settle = async (
        first: Awaited<ReturnType<typeof dispatcher.dispatch>>,
      ): Promise<Awaited<ReturnType<ToolRegistry['invoke']>>> => {
        let result = first;
        const mismatches = verdictRpcNames.has(mapped.rpc) ? await revisionMismatches(result, fileSystem) : [];
        if (verdictRpcNames.has(mapped.rpc)) {
          assertNotAborted(invocation.signal);
        }
        if (mismatches.length > 0) {
          result = await dispatchOnce();
          assertNotAborted(invocation.signal);
          const [mismatch] = await revisionMismatches(result, fileSystem);
          assertNotAborted(invocation.signal);
          if (mismatch) {
            return {
              content: {
                errorCode: 'STALE_EVALUATION',
                message:
                  `${invocation.toolName} answered for ${mismatch.actual.path} at ${mismatch.actual.digest}, ` +
                  `but the current filesystem has ${mismatch.expected.digest} there. Re-running did not ` +
                  'establish a current answer. Consumed snapshot evidence cannot certify the current files.',
                expected: mismatch.expected,
                actual: mismatch.actual,
              },
              isError: true,
            };
          }
        }
        if (mapped.rpc === rpcName.runGeoSpecTests && result.success) {
          const verdict = testModelOutputSchema.parse(result);
          const full = JSON.stringify(result);
          const bytes = new TextEncoder().encode(full);
          const oversized = bytes.byteLength > 128 * 1024;
          const hasCanonical = [...verdict.failures, ...verdict.passes].some((row) =>
            row.reports?.some((report) => report.canonical !== undefined),
          );
          if (hasCanonical || oversized) {
            const recordFileSystem = (options.recordFileSystemFor ?? options.fileSystemFor)(invocation.signal);
            const [artifact] =
              (await writeArtifactSet(
                {
                  toolCallId: invocation.toolCallId,
                  targetFile: 'geospec-run',
                  format: 'json',
                  files: [{ name: 'result.json', mimeType: 'application/json', bytes }],
                },
                recordFileSystem,
              )) ?? [];
            assertNotAborted(invocation.signal);
            if (artifact === undefined || artifact.byteLength !== bytes.byteLength) {
              return {
                content: {
                  errorCode: rpcClientErrorCode.ioError,
                  message: 'Failed to persist complete GeoSpec evidence to the project record filesystem.',
                },
                isError: true,
              };
            }
            const fullResult = {
              path: artifact.artifactPath,
              mimeType: 'application/json',
              byteLength: bytes.byteLength,
              sha256: await sha256String(full),
            } satisfies NonNullable<typeof verdict.fullResult>;
            assertNotAborted(invocation.signal);
            const compactReports = (reports: NonNullable<(typeof verdict.passes)[number]['reports']>) =>
              reports.map(({ canonical: _canonical, ...report }) => report);
            const { failures, passes, sourceRevisions, tests, lineage, ...summary } = verdict;
            const compact = oversized
              ? {
                  ...summary,
                  failures: failures.slice(0, 20).map(({ id, requirement, reason, suggestion, targetFile }) => ({
                    id: id.slice(0, 512),
                    requirement: requirement.slice(0, 512),
                    reason: reason.slice(0, 512),
                    suggestion: suggestion.slice(0, 512),
                    targetFile,
                  })),
                  passes: [],
                  omittedFailures: failures.length - Math.min(failures.length, 20),
                  omittedPasses: passes.length,
                  omittedSourceRevisions: sourceRevisions?.length ?? 0,
                  omittedTests: tests?.length ?? 0,
                  omittedLineage: lineage?.length ?? 0,
                  fullResult,
                }
              : {
                  ...summary,
                  ...(sourceRevisions === undefined ? {} : { sourceRevisions }),
                  ...(tests === undefined ? {} : { tests }),
                  ...(lineage === undefined ? {} : { lineage }),
                  failures: failures.map((row) => ({
                    ...row,
                    ...(row.reports === undefined ? {} : { reports: compactReports(row.reports) }),
                  })),
                  passes: passes.map((row) => ({
                    ...row,
                    ...(row.reports === undefined ? {} : { reports: compactReports(row.reports) }),
                  })),
                  fullResult,
                };
            // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- The validated RPC payload was successfully serialized as JSON before compact projection.
            return { content: structuredClone({ success: true, ...compact }) as JsonValue, isError: false };
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
        /* The agent's own view, the one its edits to the print intent go through. */
        machineSettings: options.machineSettings,
        /* Finished programs need only the project; slicing needs the export route too. */
        planPrint:
          print === undefined
            ? undefined
            : createMachinePrintPlanner({
                ...print,
                machines,
                /* This registry's own route, so the slice is validated and recorded exactly as an export is. */
                exportModel: servable(rpcForTool[toolName.exportModel])
                  ? async (input) =>
                      invokeRpcTool({
                        toolCallId: input.toolCallId,
                        toolName: toolName.exportModel,
                        input: {
                          targetFile: input.targetFile,
                          to: input.to,
                          ...(input.options === undefined ? {} : { options: input.options }),
                        },
                        signal: input.signal,
                      })
                  : undefined,
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
