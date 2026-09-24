/* eslint-disable @typescript-eslint/naming-convention -- tool identifiers are an external wire contract */
import type { HostToolInvocation, InterruptResolution, JsonObject, JsonValue, ToolRegistry } from '@taucad/agent-host';
import type {
  MachineArtifactReference,
  MachineBeginBindingInput,
  MachineClient,
  MachineControlRunInput,
  MachineDirectoryCursor,
  MachineDirectoryEntry,
  MachinePreparePrintInput,
  PrintRequest,
  PrintRequester,
  PrintRequestSummary,
} from '@taucad/runtime/machine';
import {
  cancelPrintInputSchema,
  getMachineInputSchema,
  getPrintRequestInputSchema,
  listPrintRequestsInputSchema,
  requestPrintInputSchema,
  requestPrintOptionKeys,
} from '@taucad/chat';
import { toolDescriptions, toolName } from '@taucad/chat/constants';
import { toProviderToolJsonSchema } from '@taucad/chat/schemas';
import type { SlicerOptionsInput } from '@taucad/slicer';
import { z } from 'zod';

import { captureFilesToDataUrls } from '#capture/capture-data-urls.js';

const identity = z.string().min(1).max(256);
const digest = z.string().regex(/^sha256:[0-9a-f]{64}$/u);
const timestamp = z.iso.datetime({ offset: true });
const candidate = z.strictObject({
  id: identity,
  name: identity,
  endpoint: z.strictObject({ address: identity, interface: identity }),
  claimedIdentity: z.strictObject({
    serial: identity.optional(),
    model: identity.optional(),
  }),
  observedAt: timestamp,
  expiresAt: timestamp,
});
const artifact = z.strictObject({
  revision: z.strictObject({
    authorityId: identity,
    workspaceId: identity,
    revisionId: identity,
    treeDigest: digest,
  }),
  path: z.string().min(1).max(512),
  digest,
  length: z
    .number()
    .int()
    .positive()
    .max(512 * 1024 * 1024),
  mediaType: identity,
  contract: z.strictObject({
    id: identity,
    version: z.number().int().positive(),
  }),
  selectedMember: z.string().min(1).max(512),
});
/* A typeless input side keeps the recursive JSON check off the wire, where it
 * would serialize as the `definitions` ref loops providers refuse. */
const configuration = z.any().describe('Provider configuration: any JSON value.').pipe(z.json());

/*
 * The slicer keys an agent may set. `request_print` slices before anyone
 * approves, so any other key (the engine, its service endpoint and token, the
 * machine-bound keys) refuses at this boundary, for Tau turns and MCP callers
 * alike. Typed against the slicer's own options so the list names real ones.
 */
const printOptionKeys: ReadonlySet<string> = new Set<keyof SlicerOptionsInput>(requestPrintOptionKeys);

/*
 * The print tools a CAD agent is offered take their inputs and descriptions
 * from `@taucad/chat`, the provider-facing contract; the rest are host tools.
 */
const inputs = {
  discover_machines: z.strictObject({ providerId: identity, configuration }),
  begin_machine_binding: z.strictObject({ candidate, name: identity }),
  list_machines: z.strictObject({}),
  [toolName.getMachine]: getMachineInputSchema,
  [toolName.requestPrint]: requestPrintInputSchema.superRefine(({ options = {} }, context) => {
    const refused = Object.keys(options).filter((key) => !printOptionKeys.has(key));
    if (refused.length > 0) {
      context.addIssue({
        code: 'custom',
        path: ['options'],
        message: `request_print options cannot include ${refused.map((key) => `"${key}"`).join(', ')}; they accept only ${requestPrintOptionKeys.join(', ')}.`,
      });
    }
  }),
  [toolName.getPrintRequest]: getPrintRequestInputSchema,
  [toolName.listPrintRequests]: listPrintRequestsInputSchema,
  [toolName.cancelPrint]: cancelPrintInputSchema.refine(
    (value) =>
      value.requestId === undefined
        ? value.machineId !== undefined && value.expectedProviderRunId !== undefined
        : value.machineId === undefined && value.expectedProviderRunId === undefined,
    { message: 'Give requestId alone, or machineId together with expectedProviderRunId.' },
  ),
  prepare_machine_print: z.strictObject({
    machineId: identity,
    artifact,
    configuration,
  }),
  upload_machine_print: z.strictObject({
    machineId: identity,
    preparedId: identity,
    preparedDigest: digest,
    operationId: identity,
  }),
  reconcile_machine_operation: z.strictObject({
    machineId: identity,
    operationId: identity,
  }),
  control_machine_run: z.strictObject({
    machineId: identity,
    operationId: identity,
    command: z.enum(['cancel', 'pause', 'resume', 'urgent-stop']),
    expectedProviderRunId: identity,
  }),
  capture_machine_still: z.strictObject({ machineId: identity }),
} as const;

type MachineToolName = keyof typeof inputs;

const descriptions: Readonly<Record<MachineToolName, string>> = {
  discover_machines:
    'Run one bounded machine-provider discovery using non-secret provider configuration. Never provide credentials or certificate decisions.',
  begin_machine_binding:
    'Begin the trusted host-local binding ceremony for one discovered candidate. Credentials remain outside this tool.',
  list_machines: 'List the current workspace machine directory, including freshness and observed run state.',
  [toolName.getMachine]: toolDescriptions[toolName.getMachine],
  [toolName.requestPrint]: toolDescriptions[toolName.requestPrint],
  [toolName.getPrintRequest]: toolDescriptions[toolName.getPrintRequest],
  [toolName.listPrintRequests]: toolDescriptions[toolName.listPrintRequests],
  [toolName.cancelPrint]: toolDescriptions[toolName.cancelPrint],
  prepare_machine_print:
    'Preflight one immutable revision-owned artifact against a machine: archive, digest, setup and materials are checked and nothing is transferred or started. Host paths and raw G-code are not accepted.',
  upload_machine_print:
    'Transfer one preflighted artifact to the machine storage with a new caller-retained operation ID. Nothing starts; a start only happens through an accepted print request.',
  reconcile_machine_operation:
    'Read the durable state of one exact machine operation without repeating its physical effect.',
  control_machine_run:
    'Pause, resume, cancel, or urgently stop the exact currently observed provider run using a new operation ID.',
  capture_machine_still:
    'Capture one authenticated, rate-limited, short-lived bounded still without changing machine or run state.',
};

const toolNames = new Set<string>(Object.keys(inputs));
const asJson = (value: unknown): JsonValue => {
  // SAFETY: machine channel outputs are admitted bounded JSON values before reaching this adapter.
  return structuredClone(value) as JsonValue;
};

/**
 * What `request_print` needs from its host beyond the machine client.
 *
 * Slices the named source through the runtime export route to `gcode.3mf` —
 * the same route `export_geometry` takes, so the artifact is recorded in the
 * project as a revision-owned reference — composes the provider's submission
 * configuration for the resolved machine (expected setup from what the machine
 * observes, since an agent cannot know a provider's schema), and summarizes the
 * toolpath (`@taucad/slicer/toolpath`) for the approval prompt.
 *
 * @public
 */
export type MachinePrintPlanner = (
  input: Readonly<{
    /** The tool call, for a deterministic artifact directory across retries. */
    toolCallId: string;
    /** Project-relative CAD source the agent named. */
    targetFile: string;
    /** The machine the print is for, as the directory currently observes it. */
    machine: MachineDirectoryEntry;
    /** Where the directory was read; qualifies the reference's authority and workspace. */
    cursor: MachineDirectoryCursor;
    preset?: 'fast' | 'standard' | 'fine' | undefined;
    /** Slicer options, keys from `requestPrintOptionKeys` only; the slicer's own schema validates the values. */
    options?: JsonObject | undefined;
    signal: AbortSignal;
  }>,
) => Promise<
  Readonly<{
    artifact: MachineArtifactReference;
    /** The provider's submission configuration for this machine. */
    configuration: PrintRequest['configuration'];
    summary?: Omit<PrintRequestSummary, 'fileName'> | undefined;
  }>
>;

/** Options for {@link createMachineToolRegistry}. @public */
export type MachineToolRegistryOptions = {
  /** Backs `request_print`; without it the tool is not offered rather than offered-and-failing. */
  readonly planPrint?: MachinePrintPlanner | undefined;
};

/** Request states in which there is nothing left to stop. */
const settledStates = new Set<PrintRequest['state']>(['denied', 'withdrawn', 'rejected', 'failed']);

/** Who settled a paused request, as the ledger records it, per answer. */
const resolutionLabels = {
  approved: 'Accepted in chat',
  denied: 'Declined in chat',
  cancelled: 'Stopped with the chat turn',
} as const satisfies Record<InterruptResolution['outcome'], string>;

const definitionFor = (name: MachineToolName) => ({
  name,
  description: descriptions[name],
  // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- draft-7 JSON Schema is JSON by construction.
  inputSchema: toProviderToolJsonSchema(inputs[name]) as JsonObject,
});

const describeMachines = (entries: readonly MachineDirectoryEntry[]): string =>
  entries.map((entry) => `${entry.machineId} (${entry.descriptor.name})`).join(', ');

/**
 * The machine a print is for: the one named, or the only one bound.
 *
 * @param client - The negotiated machines facet.
 * @param machineId - The agent's choice, when it made one.
 * @param signal - Cancels the directory read.
 * @returns The directory entry the request targets and the cursor it was read at.
 * @throws When the choice is unknown or ambiguous; the message lists what is bound.
 */
const resolveMachine = async (
  client: MachineClient,
  machineId: string | undefined,
  signal: AbortSignal,
): Promise<Readonly<{ entry: MachineDirectoryEntry; cursor: MachineDirectoryCursor }>> => {
  const { cursor, entries } = await client.list({ signal });
  // Models fill an optional field with a blank instead of omitting it.
  const wanted = machineId?.trim();
  if (wanted !== undefined && wanted !== '') {
    const found = entries.find((entry) => entry.machineId === wanted);
    if (found) {
      return { entry: found, cursor };
    }
    throw new Error(`No machine ${wanted} is bound. Bound machines: ${describeMachines(entries) || 'none'}.`);
  }
  if (entries.length === 1) {
    return { entry: entries[0]!, cursor };
  }
  throw new Error(
    entries.length === 0
      ? 'No machine is bound to this workspace; the person binds one in the Print pane.'
      : `Several machines are bound; pass machineId. Bound machines: ${describeMachines(entries)}.`,
  );
};

const formatDuration = (seconds: number): string => {
  const minutes = Math.round(seconds / 60);
  if (minutes < 1) {
    return 'under a minute';
  }
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return hours === 0 ? `${String(rest)} min` : `${String(hours)} h ${String(rest)} min`;
};

/**
 * The one line the person decides on.
 *
 * @param request - The request as the ledger recorded it.
 * @param machine - The machine it targets.
 * @returns "Print pyramid.gcode.3mf on Workshop X1C? 125 layers, about 1 h 5 min."
 */
const approvalPrompt = (request: PrintRequest, machine: MachineDirectoryEntry): string => {
  const facts = [
    ...(request.summary.layers === undefined ? [] : [`${String(request.summary.layers)} layers`]),
    ...(request.summary.estimatedDuration === undefined
      ? []
      : [`about ${formatDuration(request.summary.estimatedDuration)}`]),
  ];
  return `Print ${request.summary.fileName} on ${machine.descriptor.name}?${facts.length === 0 ? '' : ` ${facts.join(', ')}.`}`;
};

const findRequest = async (client: MachineClient, requestId: string, signal: AbortSignal): Promise<PrintRequest> => {
  const requests = await client.listPrintRequests({ signal });
  const found = requests.find((request) => request.requestId === requestId);
  if (!found) {
    throw new Error(`No print request ${requestId}.`);
  }
  return found;
};

/**
 * Who is asking, as far as the invocation can tell.
 *
 * ponytail: the invocation carries a run id but no agent identity, so this
 * distinguishes only a Tau-hosted turn (it can pause for approval) from any
 * other caller (MCP, API-coordinated). Put an agent id on the invocation when a
 * surface needs to name the vendor agent.
 */
const requesterOf = (invocation: HostToolInvocation): PrintRequester =>
  invocation.approve === undefined
    ? { kind: 'agent', id: 'external-agent', label: 'External agent' }
    : { kind: 'agent', id: 'tau', label: 'Tau agent' };

/**
 * `request_print`: resolve the machine, plan, open the request, and gate it.
 *
 * @param host - The negotiated machines facet and the planner that slices for it.
 * @param invocation - The tool call, with its run approval when the host has one.
 * @param parsed - Validated tool input.
 * @returns The ledger's record, plus how the person answered when this call waited.
 */
const requestPrint = async (
  host: { readonly client: MachineClient; readonly planPrint: MachinePrintPlanner },
  invocation: HostToolInvocation,
  parsed: z.infer<typeof inputs.request_print>,
): Promise<JsonValue> => {
  const { client } = host;
  const { signal } = invocation;
  const { entry: machine, cursor } = await resolveMachine(client, parsed.machineId, signal);
  const machineName = machine.descriptor.name;
  const plan = await host.planPrint({
    toolCallId: invocation.toolCallId,
    targetFile: parsed.targetFile,
    machine,
    cursor,
    preset: parsed.preset,
    // SAFETY: a zod record of JSON values is a JSON object.
    options: parsed.options as JsonObject | undefined,
    signal,
  });
  signal.throwIfAborted();
  /* Idempotent by the tool call: a retried call finds its own request rather
   * than opening a second one for the same intent. */
  const requestId = invocation.toolCallId;
  const request = await client.requestPrint({
    machineId: machine.machineId,
    artifact: plan.artifact,
    configuration: plan.configuration,
    requestedBy: requesterOf(invocation),
    summary: { fileName: plan.artifact.path.split('/').at(-1) ?? plan.artifact.path, ...plan.summary },
    requestId,
    signal,
  });
  if (request.state !== 'awaiting-approval') {
    /* Preflight refused, or the retry found a request already past its
     * approval: the record says which. */
    return asJson({ request, machineName });
  }
  if (invocation.approve === undefined) {
    return asJson({
      request,
      machineName,
      nextStep: `Waiting for a person to accept print request ${requestId} in Tau's Print pane; accepting uploads the file and starts the print. Do not retry; call get_print_request to observe it.`,
    });
  }
  const resolution = await invocation.approve({
    prompt: approvalPrompt(request, machine),
    payload: {
      kind: 'print-request',
      requestId,
      machineId: machine.machineId,
      fileName: request.summary.fileName,
      artifactDigest: plan.artifact.digest,
    },
  });
  const resolvedBy: PrintRequester = { kind: 'user', id: 'chat', label: resolutionLabels[resolution.outcome] };
  /* A denial is the person's decision and ends the request `denied`; only a run
   * that was aborted or closed withdraws it. Both are safety answers that must
   * land even while the run is being cancelled, so neither takes the signal. */
  const settled =
    resolution.outcome === 'approved'
      ? await client.resolvePrintRequest({ requestId, decision: 'approve', resolvedBy, signal })
      : resolution.outcome === 'denied'
        ? await client.resolvePrintRequest({ requestId, decision: 'deny', resolvedBy })
        : await client.withdrawPrintRequest({ requestId, resolvedBy });
  return asJson({ request: settled, machineName, approval: resolution.outcome });
};

/**
 * `cancel_print`: withdraw what has not started, cancel what has.
 *
 * @param client - The negotiated machines facet.
 * @param invocation - The tool call; its id names the cancel operation.
 * @param parsed - Validated tool input.
 * @returns The request and, for a started one, the cancel receipt.
 */
const cancelPrint = async (
  client: MachineClient,
  invocation: HostToolInvocation,
  parsed: z.infer<typeof inputs.cancel_print>,
): Promise<JsonValue> => {
  const { signal } = invocation;
  const operationId = `${invocation.toolCallId}:cancel`;
  if (parsed.requestId === undefined) {
    return asJson(
      await client.controlRun({
        machineId: parsed.machineId!,
        operationId,
        command: 'cancel',
        expectedProviderRunId: parsed.expectedProviderRunId!,
        signal,
      }),
    );
  }
  const request = await findRequest(client, parsed.requestId, signal);
  if (request.state === 'started') {
    const { receipt } = request;
    const expectedProviderRunId =
      receipt?.status === 'accepted' && receipt.kind !== 'upload' ? receipt.providerRunId : undefined;
    if (expectedProviderRunId === undefined) {
      throw new Error(`Print request ${request.requestId} started without a provider run id; reconcile it first.`);
    }
    const cancelled = await client.controlRun({
      machineId: request.machineId,
      operationId,
      command: 'cancel',
      expectedProviderRunId,
      signal,
    });
    return asJson({ request, receipt: cancelled });
  }
  if (settledStates.has(request.state)) {
    return asJson({ request });
  }
  return asJson({
    request: await client.withdrawPrintRequest({ requestId: request.requestId, resolvedBy: requesterOf(invocation) }),
  });
};

const invokeMachine = async (
  client: MachineClient,
  options: MachineToolRegistryOptions,
  invocation: HostToolInvocation & { readonly toolName: MachineToolName },
): Promise<JsonValue> => {
  const { input, signal, toolName: name } = invocation;
  switch (name) {
    case 'discover_machines': {
      const parsed = inputs.discover_machines.parse(input);
      const events = [];
      for await (const event of client.discover({ ...parsed, signal })) {
        if (events.length === 256) {
          throw new Error('Machine discovery exceeded the tool result limit.');
        }
        events.push(event);
      }
      return asJson({ events });
    }
    case 'begin_machine_binding': {
      const parsed = inputs.begin_machine_binding.parse(input);
      // SAFETY: the strict schema above is the JSON projection of MachineCandidate.
      return asJson(
        await client.beginBinding({
          ...parsed,
          candidate: parsed.candidate as MachineBeginBindingInput['candidate'],
          signal,
        }),
      );
    }
    case 'list_machines': {
      inputs.list_machines.parse(input);
      return asJson(await client.list({ signal }));
    }
    case 'get_machine': {
      const { machineId } = inputs.get_machine.parse(input);
      const { entry } = await resolveMachine(client, machineId, signal);
      return asJson(entry);
    }
    case 'request_print': {
      const parsed = inputs.request_print.parse(input);
      if (!options.planPrint) {
        throw new Error('This host cannot slice for printing.');
      }
      return requestPrint({ client, planPrint: options.planPrint }, invocation, parsed);
    }
    case 'get_print_request': {
      const { requestId } = inputs.get_print_request.parse(input);
      return asJson({ request: await findRequest(client, requestId, signal) });
    }
    case 'list_print_requests': {
      const parsed = inputs.list_print_requests.parse(input);
      const requests = await client.listPrintRequests({ ...parsed, signal });
      return asJson({ requests: requests.slice(0, 64), total: requests.length });
    }
    case 'cancel_print': {
      return cancelPrint(client, invocation, inputs.cancel_print.parse(input));
    }
    case 'prepare_machine_print': {
      const parsed = inputs.prepare_machine_print.parse(input);
      // SAFETY: the strict artifact schema validates the complete immutable-reference wire shape.
      return asJson(
        await client.preparePrint({
          ...parsed,
          artifact: parsed.artifact as MachineArtifactReference,
          configuration: parsed.configuration as MachinePreparePrintInput['configuration'],
          signal,
        }),
      );
    }
    case 'upload_machine_print': {
      const parsed = inputs.upload_machine_print.parse(input);
      // SAFETY: digest fields are checked against the canonical sha256 wire form above.
      return asJson(
        await client.uploadPrint({
          ...(parsed as Omit<Parameters<MachineClient['uploadPrint']>[0], 'signal'>),
          signal,
        }),
      );
    }
    case 'reconcile_machine_operation': {
      return asJson(
        await client.reconcileOperation({
          ...inputs.reconcile_machine_operation.parse(input),
          signal,
        }),
      );
    }
    case 'control_machine_run': {
      const parsed = inputs.control_machine_run.parse(input);
      return asJson(
        await client.controlRun({
          ...(parsed as Omit<MachineControlRunInput, 'signal'>),
          signal,
        }),
      );
    }
    case 'capture_machine_still': {
      const { machineId } = inputs.capture_machine_still.parse(input);
      const still = await client.captureStill({ machineId, signal });
      const [dataUrl] = captureFilesToDataUrls([{ mimeType: still.mediaType, bytes: still.bytes }]);
      if (!dataUrl) {
        throw new Error('MACHINE_STILL_ENCODING_FAILED');
      }
      return {
        machineId,
        capturedAt: still.capturedAt,
        expiresAt: still.expiresAt,
        byteLength: still.bytes.byteLength,
        images: [{ view: machineId, dataUrl }],
      };
    }
  }
};

/**
 * Build the explicit machine tools over one already negotiated and granted client.
 *
 * No tool here starts a print: a start happens only inside the host's print
 * request ledger after a person accepts the request (blueprint D4, D12).
 *
 * @param client - The negotiated machines facet.
 * @param options - Host capabilities beyond the client.
 * @returns The machine tool registry.
 * @public
 */
export const createMachineToolRegistry = (
  client: MachineClient,
  options: MachineToolRegistryOptions = {},
): ToolRegistry => ({
  list: () =>
    (Object.keys(inputs) as MachineToolName[])
      .filter((name) => name !== 'request_print' || options.planPrint !== undefined)
      .map((name) => definitionFor(name)),
  async invoke(invocation) {
    if (!toolNames.has(invocation.toolName)) {
      return {
        content: {
          errorCode: 'TOOL_NOT_FOUND',
          message: `Unknown tool: ${invocation.toolName}`,
        },
        isError: true,
      };
    }
    try {
      invocation.signal.throwIfAborted();
      return {
        content: await invokeMachine(client, options, {
          ...invocation,
          toolName: invocation.toolName as MachineToolName,
        }),
        isError: false,
      };
    } catch (error) {
      if (invocation.signal.aborted) {
        throw invocation.signal.reason instanceof Error
          ? invocation.signal.reason
          : new DOMException('The operation was aborted.', 'AbortError');
      }
      return {
        content: {
          errorCode: error instanceof z.ZodError ? 'TOOL_INPUT_VALIDATION_FAILED' : 'MACHINE_TOOL_ERROR',
          message:
            error instanceof z.ZodError
              ? z.prettifyError(error)
              : error instanceof Error
                ? error.message
                : String(error),
        },
        isError: true,
      };
    }
  },
});

/** Whether a name belongs to the bounded machine registry. @internal */
export const isMachineToolName = (name: string): name is MachineToolName => toolNames.has(name);
