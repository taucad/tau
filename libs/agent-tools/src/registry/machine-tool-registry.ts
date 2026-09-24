/* eslint-disable @typescript-eslint/naming-convention -- tool identifiers are an external wire contract */
import type { HostToolInvocation, JsonObject, JsonValue, ToolRegistry } from '@taucad/agent-host';
import type {
  MachineArtifactReference,
  MachineBeginBindingInput,
  MachineClient,
  MachineControlRunInput,
  MachinePreparePrintInput,
  MachineStartPrintInput,
} from '@taucad/runtime/machine';
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
const configuration = z.json();

const inputs = {
  discover_machines: z.strictObject({ providerId: identity, configuration }),
  begin_machine_binding: z.strictObject({ candidate, name: identity }),
  list_machines: z.strictObject({}),
  get_machine: z.strictObject({ machineId: identity }),
  prepare_machine_print: z.strictObject({
    machineId: identity,
    artifact,
    configuration,
  }),
  start_machine_print: z.strictObject({
    machineId: identity,
    preparedId: identity,
    preparedDigest: digest,
    expectedSetupDigest: digest,
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
  get_machine: 'Read one logical machine by its exact machine ID.',
  prepare_machine_print:
    'Preflight and transfer one immutable revision-owned artifact without starting a physical run. Host paths and raw G-code are not accepted.',
  start_machine_print:
    'Start one exact prepared print with a new caller-retained operation ID. Never retry an unknown result; reconcile it instead.',
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

const definitionFor = (name: MachineToolName) => {
  const inputSchema = z.toJSONSchema(inputs[name], {
    target: 'draft-7',
    io: 'input',
  }) as JsonObject & {
    $schema?: unknown;
  };
  delete inputSchema.$schema;
  return { name, description: descriptions[name], inputSchema };
};

const invokeMachine = async (
  client: MachineClient,
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
      return asJson(await client.get({ ...inputs.get_machine.parse(input), signal }));
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
    case 'start_machine_print': {
      const parsed = inputs.start_machine_print.parse(input);
      // SAFETY: digest fields are checked against the canonical sha256 wire form above.
      return asJson(
        await client.startPrint({
          ...(parsed as Omit<MachineStartPrintInput, 'signal'>),
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

/** Build the explicit machine tools over one already negotiated and granted client. @public */
export const createMachineToolRegistry = (client: MachineClient): ToolRegistry => ({
  list: () => (Object.keys(inputs) as MachineToolName[]).map((name) => definitionFor(name)),
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
        content: await invokeMachine(client, {
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
