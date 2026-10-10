/* eslint-disable @typescript-eslint/naming-convention -- tool identifiers are an external wire contract */
import type {
  HostToolApprovalAnswer,
  HostToolInvocation,
  HostToolResult,
  InterruptResolution,
  JsonObject,
  JsonValue,
  ToolRegistry,
} from '@taucad/agent-host';
import type { KernelIssue } from '@taucad/runtime';
import {
  checkMachineAction,
  fffProcessOf,
  isSimulatedMachine,
  machineActionIntent,
  personOnlyJobApproval,
} from '@taucad/runtime/machine';
import type {
  MachineActionDescriptor,
  MachineApplyActionInput,
  MachineArtifactReference,
  MachineClient,
  MachineDirectoryEntry,
  MachineFailureCode,
  MachineJob,
  MachineJobCheck,
  MachineProgramSummary,
  MachineProvider,
  MachineReceipt,
  MachineRequestJobInput,
  MachineRequester,
} from '@taucad/runtime/machine';
import {
  checkJobInputSchema,
  getMachineInputSchema,
  getPrintProfilesInputSchema,
  listMachinesInputSchema,
  machineActionInputSchema,
  printOptionKeys,
  requestJobInputSchema,
  stopMachineInputSchema,
} from '@taucad/chat';
import { toolDescriptions, toolName } from '@taucad/chat/constants';
import type { ToolInputValidationError } from '@taucad/chat';
import type { MachineSettingsService } from '@taucad/types';
import { toProviderToolJsonSchema } from '@taucad/chat/schemas';
import type { SlicerOptionsInput } from '@taucad/slicer';
import { z } from 'zod';

import { captureFilesToDataUrls } from '#capture/capture-data-urls.js';
import {
  checkText,
  describeMachineText,
  formatDuration,
  listMachinesText,
  noMachineText,
  outcomeText,
  remedyText,
  sentence,
} from '#registry/machine-text.js';
import {
  defaultBambuStudioEngine,
  describePrintProfiles,
  readProjectMachinePreferences,
} from '#registry/print-profiles.js';
import type { BambuStudioEngine, ResolvedMachinePreferences } from '#registry/print-profiles.js';

/*
 * The slicer keys an agent may set. A job is sliced before anyone approves it,
 * so any other key (the engine, its service endpoint and token, the
 * machine-bound keys) refuses at this boundary, for Tau turns and MCP callers
 * alike. Typed against the slicer's own options so the list names real ones.
 */
const allowedOptionKeys: ReadonlySet<string> = new Set<keyof SlicerOptionsInput>(printOptionKeys);

const withOptionKeys = <Schema extends typeof requestJobInputSchema>(schema: Schema, tool: string): Schema =>
  schema.superRefine(({ options = {} }, context) => {
    const refused = Object.keys(options).filter((key) => !allowedOptionKeys.has(key));
    if (refused.length > 0) {
      context.addIssue({
        code: 'custom',
        path: ['options'],
        message: `${tool} options cannot include ${refused.map((key) => `"${key}"`).join(', ')}; they accept only ${printOptionKeys.join(', ')}.`,
      });
    }
  });

/*
 * The machine tools a CAD agent is offered take their inputs and descriptions
 * from `@taucad/chat`, the provider-facing contract; the rest are host tools.
 * Discovery and binding are a person's, in Tau: an agent session holds no grant for them, so no tool offers them.
 */
const inputs = {
  [toolName.listMachines]: listMachinesInputSchema,
  [toolName.getMachine]: getMachineInputSchema,
  [toolName.machineAction]: machineActionInputSchema,
  [toolName.stopMachine]: stopMachineInputSchema,
  [toolName.getPrintProfiles]: getPrintProfilesInputSchema,
  [toolName.requestJob]: withOptionKeys(requestJobInputSchema, toolName.requestJob),
  [toolName.checkJob]: withOptionKeys(checkJobInputSchema, toolName.checkJob),
  capture_machine_still: z.strictObject({ machineId: z.string().min(1).max(256) }),
} as const;

type MachineToolName = keyof typeof inputs;

const descriptions: Readonly<Record<MachineToolName, string>> = {
  [toolName.listMachines]: toolDescriptions[toolName.listMachines],
  [toolName.getMachine]: toolDescriptions[toolName.getMachine],
  [toolName.machineAction]: toolDescriptions[toolName.machineAction],
  [toolName.stopMachine]: toolDescriptions[toolName.stopMachine],
  [toolName.getPrintProfiles]: toolDescriptions[toolName.getPrintProfiles],
  [toolName.requestJob]: toolDescriptions[toolName.requestJob],
  [toolName.checkJob]: toolDescriptions[toolName.checkJob],
  capture_machine_still:
    'Capture one authenticated, rate-limited, short-lived bounded still without changing machine or run state.',
};

const toolNames = new Set<string>(Object.keys(inputs));
const asJson = (value: unknown): JsonValue => {
  // SAFETY: machine channel outputs are admitted bounded JSON values before reaching this adapter.
  return structuredClone(value) as JsonValue;
};

/**
 * What `request_job` and `check_job` need from their host beyond the machine client.
 *
 * For a `targetFile`, slices it through the runtime export route into a container the machine accepts — the same
 * route `export_model` takes, so the artifact is recorded in the project and named by the project, its path and its
 * digest; a host without that route refuses a `targetFile`. For an
 * `artifact`, reads the finished program and names it the same way, in the container the machine accepts. Either
 * way it returns only what the call chose of the provider's start form; the provider completes the rest from what
 * the machine reports (`checkJob`), and summarizes the program for the approval prompt.
 *
 * @public
 */
export type MachinePrintPlanner = (
  input: Readonly<
    {
      /** The tool call, for a deterministic artifact directory across retries. */
      toolCallId: string;
      /** The machine the job is for, as the directory currently observes it. */
      machine: MachineDirectoryEntry;
      preset?: 'fast' | 'standard' | 'fine' | undefined;
      /** The plate the agent was told is installed; the machine's own report wins. */
      plate?: string | undefined;
      /** Slicer options, keys from `printOptionKeys` only; the slicer's own schema validates the values. */
      options?: JsonObject | undefined;
      /** Bambu Studio presets the agent chose; the machine's defaults fill the rest. */
      profiles?: BambuStudioInput['profiles'];
      /** Bambu Studio setting keys and values applied over the presets. */
      settings?: BambuStudioInput['settings'];
      /**
       * The project's print intent file as this call read it, or undefined when
       * the project has none. The planner applies it under the call's own
       * choices when it names this machine's model.
       */
      preferences?: ResolvedMachinePreferences | undefined;
      signal: AbortSignal;
    } & (
      | {
          /** Project-relative CAD source the agent named, to slice. */
          targetFile: string;
          artifact?: undefined;
        }
      | {
          /** Project-relative finished program the agent named, run as is. */
          artifact: string;
          targetFile?: undefined;
        }
    )
  >,
) => Promise<
  Readonly<{
    artifact: MachineArtifactReference;
    /** What this call chose of the provider's start form; `checkJob` completes it. */
    configuration: MachineRequestJobInput['configuration'];
    /** What the program is, as Tau read it; the host's own parse wins. */
    program: Partial<MachineProgramSummary> & Readonly<{ name: string }>;
    /**
     * The plate id the job is for when the machine does not report one: stated by the call or by the project's saved
     * settings. The approval prompt names it, since the person approves a print made for it.
     */
    statedPlate?: string | undefined;
    /** What the project's print intent contributed, or why it was ignored, for the tool result. */
    machinePreferences?: JsonObject | undefined;
    /** What the slice could not honour although it was made, or what Tau could not read; the agent tells the person. */
    warnings?: readonly KernelIssue[] | undefined;
  }>
>;

/** Engine-specific slicing fields of `request_job`. */
type BambuStudioInput = NonNullable<z.infer<typeof requestJobInputSchema>['bambuStudio']>;

/** Options for {@link createMachineToolRegistry}. @public */
export type MachineToolRegistryOptions = {
  /** Backs `request_job` and `check_job`; without it neither is offered rather than offered-and-failing. */
  readonly planPrint?: MachinePrintPlanner | undefined;
  /**
   * The agent's project filesystem for one invocation. The job tools and
   * `get_print_profiles` read the project's print intent,
   * `.tau/machines/settings/<typeId>.json`, through it as their defaults; without it no
   * file applies.
   */
  readonly machineSettings?: Pick<MachineSettingsService, 'readMachineSettings'> | undefined;
  /** Backs `get_print_profiles`; defaults to this host's `@taucad/slicer/bambu-studio`. */
  readonly bambuStudio?: BambuStudioEngine | undefined;
  /**
   * How long `machine_action` watches for the machine to show an action it reports. Milliseconds; defaults to
   * a reading every 500 for 3000.
   */
  readonly confirmation?: Readonly<{ pollInterval: number; pollTimeout: number }> | undefined;
  /** Host-adjusted wall clock, milliseconds. Defaults to `Date.now`. */
  readonly now?: (() => number) | undefined;
};

/**
 * The project's print intent as this invocation reads it.
 *
 * @param options - The registry options; their filesystem is the agent's view of the project.
 * @param provider - Selected provider and stable type.
 * @param selection - Cancellation and optional read-only profile override.
 * @returns The file as read, or undefined when the project has none.
 */
const readPreferences = async (
  options: MachineToolRegistryOptions,
  provider: MachineProvider,
  selection: Readonly<{ signal: AbortSignal; profileId?: string }>,
): Promise<ResolvedMachinePreferences | undefined> => {
  if (!options.machineSettings) {
    throw new Error('Machine settings authority is unavailable.');
  }
  return readProjectMachinePreferences(options.machineSettings, provider, selection);
};

/** Who settled a paused request, as the record keeps it, per answer. */
const resolutionLabels = {
  approved: 'Accepted in chat',
  denied: 'Declined in chat',
  cancelled: 'Stopped with the chat turn',
} as const satisfies Record<InterruptResolution['outcome'], string>;

const chatPerson = (outcome: InterruptResolution['outcome']): MachineRequester => ({
  kind: 'user',
  id: 'chat',
  label: resolutionLabels[outcome],
});

const definitionFor = (name: MachineToolName) => ({
  name,
  description: descriptions[name],
  // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- draft-7 JSON Schema is JSON by construction.
  inputSchema: toProviderToolJsonSchema(inputs[name]) as JsonObject,
});

const describeMachines = (entries: readonly MachineDirectoryEntry[]): string =>
  entries.map((entry) => `${entry.machineId} (${entry.name})`).join(', ');

/**
 * The machine a call is for: the one named, or the only one bound.
 *
 * @param client - The negotiated machines facet.
 * @param machineId - The agent's choice, when it made one.
 * @param signal - Cancels the directory read.
 * @returns The directory entry.
 * @throws When the choice is unknown or ambiguous; the message lists what is bound.
 */
const resolveMachine = async (
  client: MachineClient,
  machineId: string | undefined,
  signal: AbortSignal,
): Promise<MachineDirectoryEntry> => {
  const { entries } = await client.list({ signal });
  // Models fill an optional field with a blank instead of omitting it.
  const wanted = machineId?.trim();
  if (wanted !== undefined && wanted !== '') {
    const found = entries.find((entry) => entry.machineId === wanted);
    if (found) {
      return found;
    }
    throw new Error(`No machine ${wanted} is bound. Bound machines: ${describeMachines(entries) || 'none'}.`);
  }
  const [only] = entries;
  if (entries.length === 1 && only !== undefined) {
    return only;
  }
  throw new Error(
    entries.length === 0
      ? noMachineText
      : `Several machines are bound; pass machineId. Bound machines: ${describeMachines(entries)}.`,
  );
};

/**
 * Who is asking, as far as the invocation can tell.
 *
 * ponytail: the invocation carries a run id but no agent identity, so this
 * distinguishes only a Tau-hosted turn (it can pause for approval) from any
 * other caller (MCP, API-coordinated). Put an agent id on the invocation when a
 * surface needs to name the vendor agent.
 */
const requesterOf = (invocation: HostToolInvocation): MachineRequester =>
  invocation.approve === undefined
    ? { kind: 'agent', id: 'external-agent', label: 'External agent' }
    : { kind: 'agent', id: 'tau', label: 'Tau agent' };

// ───────────────────────────── Actions ─────────────────────────────

type ActionStatus = 'done' | 'confirming' | 'refused' | 'needs-approval' | 'denied' | 'rejected' | 'unknown';
type ActionReport = Readonly<{ status: ActionStatus; message: string; operationId?: string; code?: string }>;

const delay = async (milliseconds: number, signal: AbortSignal): Promise<void> =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, milliseconds);
    signal.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        reject(new DOMException('The operation was aborted.', 'AbortError'));
      },
      { once: true },
    );
  });

/**
 * The parameters' problems against the action's own schema, before a person is asked to approve them. The host
 * validates again with the trusted schema.
 *
 * @param descriptor - The installed action.
 * @param parameters - What the agent sent.
 * @returns The problems in words, or undefined when they fit (or the schema cannot be read here).
 */
const parameterProblems = (descriptor: MachineActionDescriptor, parameters: JsonObject): string | undefined => {
  try {
    const schema = z.fromJSONSchema(
      descriptor.configuration.legacyProjection.inputSchema as Parameters<typeof z.fromJSONSchema>[0],
    );
    const result = schema.safeParse(parameters);
    return result.success ? undefined : z.prettifyError(result.error);
  } catch {
    // ponytail: a schema the converter cannot read is left to the host's own validation.
    return undefined;
  }
};

/** What `machine_action` sends, as asked before an approval and kept with it. */
type ActionIntent = Omit<MachineApplyActionInput, 'attended' | 'signal'> &
  Readonly<{ label: string; confirms: MachineActionDescriptor['confirms'] }>;

/** An intent this registry wrote to the session log, read back: a payload of any other shape is never sent. */
const recalledIntentSchema = z.object({
  machineId: z.string(),
  componentId: z.string(),
  capabilityRevision: z.string(),
  operationId: z.string(),
  action: z.string(),
  version: z.number().int(),
  expectedRunId: z.string().nullable(),
  parameters: z.unknown(),
  label: z.string(),
  confirms: z.enum(['observation', 'acknowledgement', 'none']),
}) satisfies z.ZodType<Omit<ActionIntent, 'requestedBy'>>;

/**
 * Send one action and say what became of it: the receipt, and for an action the machine reports, whether it
 * showed the change within a few seconds. An approval is never claimed here: the person's Approve recorded it on the
 * host under this operation id (R15), and the host matches it to this exact request.
 */
const applyIntent = async (
  client: MachineClient,
  invocation: HostToolInvocation,
  context: Readonly<{
    entry: MachineDirectoryEntry;
    intent: ActionIntent;
    confirmation: MachineToolRegistryOptions['confirmation'];
  }>,
): Promise<ActionReport> => {
  const { entry, intent } = context;
  const { signal } = invocation;
  const { label, confirms, ...request } = intent;
  const receipt = await client.applyAction({
    ...request,
    requestedBy: requesterOf(invocation),
    signal,
  });
  const { operationId } = intent;
  const named = `${label} on ${entry.name}`;
  /* The host found no approval the person recorded for this exact request. */
  if (receipt.status === 'rejected' && receipt.code === 'MACHINE_ACTION_APPROVAL_REQUIRED') {
    return {
      status: 'needs-approval',
      operationId,
      code: receipt.code,
      message: `${named} needs a person's approval, which Tau has not recorded. Ask the person to approve it in Tau.`,
    };
  }
  if (receipt.status === 'rejected') {
    return {
      status: 'rejected',
      operationId,
      code: receipt.code,
      message: `${entry.name} refused ${label}: ${receipt.message}`,
    };
  }
  if (receipt.status === 'unknown') {
    return {
      status: 'unknown',
      operationId,
      message: `Whether ${named} happened is unknown (${receipt.reason}). Do not resend it; get_machine shows what the machine reports.`,
    };
  }
  if (confirms === 'none') {
    return { status: 'done', operationId, message: `Sent ${named}; this machine does not report whether it happened.` };
  }
  if (confirms === 'acknowledgement') {
    return { status: 'done', operationId, message: `${entry.name} took ${label}.` };
  }
  const { pollInterval, pollTimeout } = context.confirmation ?? { pollInterval: 500, pollTimeout: 3000 };
  const deadline = Date.now() + pollTimeout;
  /* Reads the journal only; nothing is resent. */
  const watch = async (): Promise<ActionReport> => {
    const operation = await client.reconcileOperation({ machineId: entry.machineId, operationId, signal });
    if (operation.state === 'accepted') {
      return { status: 'done', operationId, message: `${entry.name} shows ${label} done.` };
    }
    if (operation.state === 'rejected') {
      const rejected = operation.receipt?.status === 'rejected' ? operation.receipt : undefined;
      return {
        status: 'rejected',
        operationId,
        ...(rejected === undefined ? {} : { code: rejected.code }),
        message: `${entry.name} did not do ${label}${rejected === undefined ? '' : `: ${rejected.message}`}.`,
      };
    }
    if (Date.now() >= deadline) {
      return {
        status: 'confirming',
        operationId,
        message: `${entry.name} took ${label} and has not shown the change yet. Do not resend it; get_machine shows it when it does.`,
      };
    }
    await delay(pollInterval, signal);
    return watch();
  };
  return watch();
};

/**
 * What the agent reads when a person did not approve an action: declined, or the turn stopped before they answered.
 * @param outcome - How the approval ended.
 * @param named - "Cancel the print on Workshop X1C".
 * @returns The report; nothing was sent.
 */
const unapprovedReport = (outcome: InterruptResolution['outcome'], named: string): ActionReport =>
  outcome === 'cancelled'
    ? {
        status: 'refused',
        message: `Nothing was sent: the chat turn stopped before the person answered whether to do ${named}. Ask again only if they still want it.`,
      }
    : { status: 'denied', message: `The person declined ${named}. Do not retry it unless they ask.` };

/** The approval prompt for one action: what, where, and what it does. */
const actionPrompt = (entry: MachineDirectoryEntry, descriptor: MachineActionDescriptor, parameters: JsonObject) => {
  const shown = Object.keys(parameters).length === 0 ? '' : ` (${JSON.stringify(parameters)})`;
  const what = descriptor.consequence ?? descriptor.description;
  const outcome = descriptor.outcome === undefined ? '' : ` ${outcomeText(entry, descriptor.outcome)}`;
  return `${descriptor.label}${shown} on ${entry.name}?${what === undefined ? '' : ` ${what}`}${outcome}`;
};

/**
 * A refusal in words, with what clears it.
 * @param entry - The machine.
 * @param check - Why the action is unavailable.
 * @returns The report; nothing was sent.
 */
const refusedReport = (
  entry: MachineDirectoryEntry,
  check: Readonly<{ code: MachineFailureCode; message: string; remedy?: Parameters<typeof remedyText>[1] }>,
): ActionReport => {
  const remedy = check.remedy === undefined ? '' : ` It clears with ${sentence(remedyText(entry, check.remedy))}`;
  return {
    status: 'refused',
    code: check.code,
    message:
      check.code === 'MACHINE_ACTION_PERSON_REQUIRED'
        ? `${check.message} Ask the person to do it at the machine.${remedy}`
        : `Nothing was sent: ${check.message}${remedy}`,
  };
};

/**
 * `machine_action`: check the action as the agent, then apply it, ask the person first, or say why not.
 *
 * @param client - The negotiated machines facet.
 * @param options - The confirmation watch and the clock.
 * @param invocation - The tool call; its id is the operation id, and its approval asks the person.
 * @returns What became of the action.
 */
const machineAction = async (
  client: MachineClient,
  options: MachineToolRegistryOptions,
  invocation: HostToolInvocation,
): Promise<ActionReport> => {
  const { componentId, action, machineId, ...rest } = inputs.machine_action.parse(invocation.input);
  // SAFETY: a zod record of JSON values is a JSON object.
  const parameters = (rest.parameters ?? {}) as JsonObject;
  const entry = await resolveMachine(client, machineId, invocation.signal);
  /* The key names the exact intent, so an approval is spent only on the request the person saw. */
  const key = `action:${entry.machineId}:${componentId}:${action}:${JSON.stringify(parameters)}`;
  const prior = await invocation.approve?.recall?.(key);
  if (prior !== undefined) {
    if (prior.resolution.outcome !== 'approved') {
      return unapprovedReport(prior.resolution.outcome, `${action} on ${entry.name}`);
    }
    const recalled = recalledIntentSchema.safeParse(prior.payload['intent']);
    if (!recalled.success) {
      return {
        status: 'refused',
        code: 'MACHINE_ACTION_APPROVAL_REQUIRED',
        message: `The approved request for ${action} on ${entry.name} could not be read back, so nothing was sent. Ask the person to approve it again.`,
      };
    }
    /* Who asks is the caller now, not what the log says. */
    const intent = { ...recalled.data, requestedBy: requesterOf(invocation) };
    return applyIntent(client, invocation, { entry, intent, confirmation: options.confirmation });
  }
  const check = checkMachineAction({
    entry,
    componentId,
    action,
    caller: 'agent',
    attended: false,
    now: (options.now ?? Date.now)(),
  });
  if (check.status === 'unavailable') {
    return refusedReport(entry, check);
  }
  const { descriptor } = check;
  /* The check looked among actions, not holds. */
  if (!('scope' in descriptor)) {
    throw new Error(`${componentId} ${action} is a hold, which only a person at the machine uses.`);
  }
  const problems = parameterProblems(descriptor, parameters);
  if (problems !== undefined) {
    return {
      status: 'refused',
      code: 'MACHINE_ACTION_PARAMETERS_INVALID',
      message: `Nothing was sent: the parameters do not fit ${descriptor.label}.\n${problems}`,
    };
  }
  /* The run, revision and version the agent saw: an approval for this run never reaches the next one. */
  const intent: ActionIntent = {
    ...machineActionIntent(entry, descriptor, {
      operationId: invocation.toolCallId,
      parameters,
      requestedBy: requesterOf(invocation),
    }),
    label: descriptor.label,
    confirms: descriptor.confirms,
  };
  if (check.status === 'available') {
    const sent = await applyIntent(client, invocation, { entry, intent, confirmation: options.confirmation });
    /* The host admits under a standard family's floor, which a provider's descriptor may sit below: then ask the
     * person for this same request. A refusal at admission journals nothing, so the operation id is still unused. */
    if (sent.status !== 'needs-approval' || invocation.approve === undefined) {
      return sent;
    }
  }
  if (invocation.approve === undefined) {
    return {
      status: 'needs-approval',
      message: `${descriptor.label} on ${entry.name} needs a person's approval, which only Tau can ask for. Ask the person to do it in Tau.`,
    };
  }
  const prompt = `${isSimulatedMachine(entry.descriptor.capabilities) ? 'Simulated: ' : ''}${actionPrompt(entry, descriptor, parameters)}`;
  const resolution = await invocation.approve({
    key,
    prompt,
    /* The Print pane shows the parameters and the prompt beside Approve: the person approves exactly this. */
    payload: {
      kind: 'machine-action',
      machineId: entry.machineId,
      componentId,
      action,
      operationId: intent.operationId,
      label: descriptor.label,
      parameters,
      prompt,
      // SAFETY: every field of the intent is JSON.
      intent: intent as unknown as JsonObject,
    },
  });
  if (resolution.outcome !== 'approved') {
    return unapprovedReport(resolution.outcome, `${descriptor.label} on ${entry.name}`);
  }
  /* The person's Approve recorded the approval on the host before it answered this interrupt. */
  return applyIntent(client, invocation, { entry, intent, confirmation: options.confirmation });
};

/**
 * `stop_machine`: the machine's fastest halt, open to the agent with no approval.
 */
const stopMachine = async (client: MachineClient, invocation: HostToolInvocation): Promise<ActionReport> => {
  const { machineId } = inputs.stop_machine.parse(invocation.input);
  const entry = await resolveMachine(client, machineId, invocation.signal);
  const operationId = invocation.toolCallId;
  const receipt: MachineReceipt<'stop'> = await client.stop({
    machineId: entry.machineId,
    operationId,
    requestedBy: requesterOf(invocation),
    signal: invocation.signal,
  });
  const outcome = outcomeText(entry, entry.descriptor.capabilities.stop);
  switch (receipt.status) {
    case 'accepted': {
      return { status: 'done', operationId, message: `${entry.name} took the stop. ${outcome}` };
    }
    case 'rejected': {
      return {
        status: 'rejected',
        operationId,
        code: receipt.code,
        message: `${entry.name} refused the stop: ${receipt.message} Tell the person to stop it at the machine now.`,
      };
    }
    case 'unknown': {
      return {
        status: 'unknown',
        operationId,
        message: `Whether ${entry.name} stopped is unknown (${receipt.reason}). Tell the person to check the machine now.`,
      };
    }
  }
};

// ───────────────────────────── Jobs ─────────────────────────────

/** What the person must confirm or state that only Tau's Print pane can take from them. */
const personOnlyApproval = (entry: MachineDirectoryEntry): readonly string[] | undefined => {
  const approval = personOnlyJobApproval(entry.descriptor.capabilities);
  return approval === undefined
    ? undefined
    : [...approval.attestations.map(({ label }) => label), ...(approval.attended ? ['They are at the machine'] : [])];
};

const paneStep = (entry: MachineDirectoryEntry | undefined): string => {
  const confirmations = entry === undefined ? undefined : personOnlyApproval(entry);
  return confirmations === undefined ? '' : `, where they confirm: ${confirmations.join('; ')}`;
};

/**
 * The job fields the agent reads: checks that have not passed, with their remedies in words.
 */
const jobOutput = (job: MachineJob, entry: MachineDirectoryEntry | undefined): JsonObject => {
  const checks = job.checks
    .filter(({ state }) => state !== 'passed')
    .map((check) => ({
      id: check.id,
      label: check.label,
      state: check.state,
      ...(check.detail === undefined ? {} : { detail: check.detail }),
      ...(check.remedy === undefined || entry === undefined ? {} : { remedy: remedyText(entry, check.remedy) }),
    }));
  return asJson({
    jobId: job.jobId,
    machineId: job.machineId,
    state: job.state,
    program: job.program,
    ...(checks.length === 0 ? {} : { checks }),
    ...(job.failure === undefined ? {} : { failure: job.failure }),
    ...(job.run === undefined ? {} : { run: { outcome: job.run.outcome } }),
  }) as JsonObject;
};

/**
 * What the agent tells the person and does next, for a job awaiting the person or settled: the start outcome in
 * words, so an unconfirmed start is never reported as started.
 *
 * @param job - The job as the host recorded it.
 * @param entry - Its machine, as the directory lists it.
 * @returns The next step, or undefined while the host is still working on the job.
 */
const nextStepOf = (job: MachineJob, entry: MachineDirectoryEntry | undefined): string | undefined => {
  const { jobId } = job;
  const { name } = job.program;
  const machineName = entry?.name ?? job.machineId;
  switch (job.state) {
    case 'awaiting-approval': {
      const blocked =
        entry === undefined
          ? []
          : job.checks.filter(({ state }) => state === 'blocked').map((check) => checkText(entry, check));
      const blocking = blocked.length === 0 ? '' : ` ${sentence(`It cannot start until: ${blocked.join('; ')}`)}`;
      return `Waiting for a person to accept job ${jobId} in Tau's Print pane${paneStep(entry)}; accepting starts ${name}.${blocking} Do not retry; get_machine shows the job.`;
    }
    case 'awaiting-start': {
      return `${name} is loaded on ${machineName}; a person starts it with the machine's own start. get_machine shows the run once it does.`;
    }
    case 'confirming': {
      return `Tau sent the start of ${name} and is waiting for ${machineName} to confirm it. Call get_machine shortly. Do not retry or start another job.`;
    }
    case 'started': {
      const outcome = job.run?.outcome;
      if (outcome === 'running') {
        return `${name} is running on ${machineName}. Observe it with get_machine; this job needs nothing more.`;
      }
      if (outcome === undefined || outcome === 'unknown') {
        return `${machineName} took the start of ${name} and has not reported the run since. Observe it with get_machine; do not start another job on it until it does.`;
      }
      return `The run of ${name} has ended: ${outcome}. This job needs nothing more; get_machine says whether ${machineName} is ready.`;
    }
    case 'unknown': {
      return `${machineName} has not confirmed the start of ${name} for several minutes, so whether it runs is unknown. Tell the person to check the machine; Tau keeps watching. Do not retry or start another job.`;
    }
    case 'rejected':
    case 'failed': {
      const failure = job.failure ?? (job.receipt?.status === 'rejected' ? job.receipt : undefined);
      const outcome =
        job.state === 'rejected' ? `${machineName} rejected the start of ${name}` : `Job ${jobId} for ${name} failed`;
      return failure === undefined
        ? `${outcome}. Tell the person it failed.`
        : `${outcome}. Tell the person it failed and why, with any fix its message names: "${failure.message}"`;
    }
    case 'denied': {
      return `The person declined job ${jobId}; that is their decision. Do not retry it unless they ask.`;
    }
    case 'withdrawn': {
      return `Job ${jobId} was withdrawn before it started. Do not retry it unless the person asks.`;
    }
    case 'preparing':
    case 'approved':
    case 'transferring':
    case 'starting': {
      return undefined;
    }
  }
};

const findJob = async (
  client: MachineClient,
  input: Readonly<{ jobId: string; machineId?: string }>,
  signal: AbortSignal,
): Promise<MachineJob> => {
  const jobs = await client.listJobs({
    ...(input.machineId === undefined ? {} : { machineId: input.machineId }),
    signal,
  });
  const found = jobs.find((job) => job.jobId === input.jobId);
  if (!found) {
    throw new Error(`No job ${input.jobId}.`);
  }
  return found;
};

/**
 * Settle a job by the person's answer in chat. The person's own session resolves the job before answering (R16): the
 * agent's session can never approve one, so an answer here only reads what the person's surface recorded. A run
 * stopped with the chat, or a denial no surface recorded, withdraws the request; an approval the chat could not take
 * (attestations, presence) leaves the job waiting for the Print pane.
 *
 * @param client - The negotiated machines facet.
 * @param answered - The job's ids, the answer, and the call's cancellation.
 * @returns The job as it stands.
 */
const settleApproval = async (
  client: MachineClient,
  answered: Readonly<{ jobId: string; machineId?: string; resolution: InterruptResolution; signal: AbortSignal }>,
): Promise<MachineJob> => {
  const { jobId, machineId, resolution, signal } = answered;
  const job = await findJob(client, { jobId, ...(machineId === undefined ? {} : { machineId }) }, signal);
  if (job.state !== 'awaiting-approval' || resolution.outcome === 'approved') {
    return job;
  }
  /* A safety answer that must land even while the run is being cancelled, so it does not take the signal. */
  return client.withdrawJob({ jobId, resolvedBy: chatPerson(resolution.outcome) });
};

/** What starting a program does, by process: a printer prints, a mill cuts, anything else runs it. */
const processVerbs: Readonly<Record<string, string>> = { fff: 'Print', milling: 'Cut' };

/**
 * The one line the person decides on: "Print pyramid.gcode.3mf on Workshop X1C? 125 layers, about 1 h 5 min.", with
 * "Simulated: " before it for a simulator and the plate a person stated when the machine reports none.
 *
 * @param job - The job awaiting approval.
 * @param entry - Its machine.
 * @param statedPlate - The plate id the plan is for when the machine does not report its own (the call's or the
 *   project's saved one).
 * @returns The prompt.
 */
const approvalPrompt = (job: MachineJob, entry: MachineDirectoryEntry, statedPlate: string | undefined): string => {
  const { program } = job;
  /* A program the host has not read yet is `other`; the machine's own process names it then. */
  const process =
    program.facts.process === 'other'
      ? entry.descriptor.capabilities.processes.find(({ type }) => type in processVerbs)?.type
      : program.facts.process;
  const verb = (process === undefined ? undefined : processVerbs[process]) ?? 'Run';
  const facts = [
    ...(program.facts.process === 'fff' && program.facts.layers !== undefined
      ? [`${String(program.facts.layers)} layers`]
      : []),
    ...(program.estimatedDuration === undefined ? [] : [formatDuration(program.estimatedDuration)]),
  ];
  const plate =
    statedPlate === undefined
      ? undefined
      : fffProcessOf(entry.descriptor.capabilities)?.bed.plates.find(({ id }) => id === statedPlate);
  const confirmations = personOnlyApproval(entry);
  const simulated = isSimulatedMachine(entry.descriptor.capabilities) ? 'Simulated: ' : '';
  return `${simulated}${verb} ${program.name} on ${entry.name}?${facts.length === 0 ? '' : ` ${facts.join(', ')}.`}${plate === undefined ? '' : ` On the ${plate.label}, as stated; ${entry.name} does not report its plate.`}${confirmations === undefined ? '' : ` Accept it in the Print pane, confirming: ${confirmations.join('; ')}.`}`;
};

const jobReport = (job: MachineJob, entry: MachineDirectoryEntry | undefined, extra: JsonObject = {}): JsonValue => {
  const nextStep = nextStepOf(job, entry);
  return {
    job: jobOutput(job, entry),
    ...(entry === undefined
      ? {}
      : { machineName: entry.name, simulated: isSimulatedMachine(entry.descriptor.capabilities) }),
    ...extra,
    ...(nextStep === undefined ? {} : { nextStep }),
  };
};

/**
 * Prepare the program for one machine and ask the machine about it: slice a `targetFile` with the project's print
 * intent, or read a finished `artifact`, then `checkJob` with what the call chose, which the provider completes from
 * what the machine reports. What both job tools start from; it records nothing.
 *
 * @param client - The negotiated machines facet.
 * @param options - The planner and the project filesystem.
 * @param call - The tool call, its parsed input and its machine.
 * @returns The plan, the machine's check with the completed configuration, and what the call reports either way.
 */
const planJob = async (
  client: MachineClient,
  options: MachineToolRegistryOptions,
  call: Readonly<{
    invocation: HostToolInvocation;
    parsed: z.infer<typeof requestJobInputSchema>;
    entry: MachineDirectoryEntry;
  }>,
): Promise<
  Readonly<{
    plan: Awaited<ReturnType<MachinePrintPlanner>>;
    check: MachineJobCheck;
    reported: JsonObject;
  }>
> => {
  const { invocation, parsed, entry } = call;
  const { planPrint } = options;
  if (!planPrint) {
    throw new Error('This host cannot prepare jobs.');
  }
  const { signal } = invocation;
  const providers = await client.listProviders({ signal });
  const provider = providers.find(({ id }) => id === entry.providerId);
  if (!provider) {
    throw new Error(`Provider ${entry.providerId} is unavailable.`);
  }
  const common = {
    toolCallId: invocation.toolCallId,
    machine: entry,
    plate: parsed.plate,
    signal,
  };
  const plan =
    parsed.artifact === undefined
      ? await planPrint({
          ...common,
          targetFile: sourceOf(parsed),
          preset: parsed.preset,
          // SAFETY: a zod record of JSON values is a JSON object.
          options: parsed.options as JsonObject | undefined,
          profiles: parsed.bambuStudio?.profiles,
          settings: parsed.bambuStudio?.settings,
          preferences: await readPreferences(options, provider, { signal, profileId: parsed.profileId }),
        })
      : await planPrint({ ...common, artifact: parsed.artifact });
  signal.throwIfAborted();
  const check = await client.checkJob({
    machineId: entry.machineId,
    artifact: plan.artifact,
    configuration: plan.configuration,
    signal,
  });
  const reported = asJson({
    ...(plan.machinePreferences === undefined ? {} : { machinePreferences: plan.machinePreferences }),
    ...(plan.warnings === undefined ? {} : { warnings: plan.warnings }),
  }) as JsonObject;
  return { plan, check, reported };
};

/** What a job call names: its CAD source or its finished program; the input schema requires exactly one. */
const sourceOf = (parsed: Readonly<{ targetFile?: string | undefined; artifact?: string | undefined }>): string => {
  const source = parsed.targetFile ?? parsed.artifact;
  if (source === undefined) {
    throw new Error('Pass exactly one of targetFile or artifact.');
  }
  return source;
};

/** A refused program in words: nothing was recorded or sent. */
const refusedText = (entry: MachineDirectoryEntry, check: Extract<MachineJobCheck, { status: 'refused' }>) =>
  `${entry.name} refused the program, so nothing was recorded or sent: ${sentence(check.message)} (${check.code})`;

/**
 * `request_job`: resolve the machine, prepare the program, check it, request the job, and gate it.
 *
 * @param client - The negotiated machines facet.
 * @param options - The planner that prepares it and the project filesystem.
 * @param invocation - The tool call, with its run approval when the host has one.
 * @returns The job, how the person answered when this call waited, the next step, what the project's print intent
 *   contributed, and what the slice could not honour.
 * @throws When the machine refuses the program; no job is recorded then.
 */
const requestJob = async (
  client: MachineClient,
  options: MachineToolRegistryOptions,
  invocation: HostToolInvocation,
): Promise<JsonValue> => {
  const parsed = inputs.request_job.parse(invocation.input);
  const { signal } = invocation;
  const entry = await resolveMachine(client, parsed.machineId, signal);
  /* Under a Tau host asking paused the run, and this is its next attempt. The person answered the job they saw, so
   * that job is settled, not a new plan. */
  const approvalKey = `job:${entry.machineId}:${sourceOf(parsed)}`;
  const prior = await invocation.approve?.recall?.(approvalKey);
  const priorJobId = prior?.payload['jobId'];
  if (prior !== undefined && typeof priorJobId === 'string') {
    const job = await findJob(client, { jobId: priorJobId, machineId: entry.machineId }, signal);
    if (job.state !== 'awaiting-approval') {
      /* Settled already, by the hand-over or by the Print pane: the job's answer is the effective one. */
      const approval =
        job.state === 'denied' ? 'denied' : job.state === 'withdrawn' ? 'cancelled' : prior.resolution.outcome;
      return jobReport(job, entry, { approval });
    }
    const settled = await settleApproval(client, {
      jobId: priorJobId,
      machineId: entry.machineId,
      resolution: prior.resolution,
      signal,
    });
    return jobReport(settled, entry, { approval: prior.resolution.outcome });
  }
  const { plan, check, reported } = await planJob(client, options, { invocation, parsed, entry });
  if (check.status === 'refused') {
    throw new Error(refusedText(entry, check));
  }
  /* Idempotent by the tool call: a retried call finds its own job rather than requesting a second one. */
  const jobId = invocation.toolCallId;
  const job = await client.requestJob({
    machineId: entry.machineId,
    artifact: plan.artifact,
    /* The provider's completion of what the call chose: what the person approves is what starts. */
    configuration: check.configuration,
    requestedBy: requesterOf(invocation),
    /* Tau's read of the program, or the machine's facts where Tau could not read it (`other`, or none). */
    program:
      plan.program.facts === undefined || plan.program.facts.process === 'other'
        ? { ...plan.program, facts: check.program.facts }
        : plan.program,
    jobId,
    signal,
  });
  if (job.state !== 'awaiting-approval' || invocation.approve === undefined) {
    /* Preflight refused, the retry found a job already past its approval, or no person can answer here. */
    return jobReport(job, entry, reported);
  }
  const resolution = await invocation.approve({
    key: approvalKey,
    prompt: approvalPrompt(job, entry, plan.statedPlate),
    payload: {
      kind: 'job',
      jobId,
      machineId: entry.machineId,
      fileName: job.program.name,
      artifactDigest: plan.artifact.digest,
    },
  });
  const settled = await settleApproval(client, { jobId, machineId: entry.machineId, resolution, signal });
  return jobReport(settled, entry, { approval: resolution.outcome, ...reported });
};

/** `check_job`: prepare as `request_job` would and ask the machine, recording nothing. */
const checkJob = async (
  client: MachineClient,
  options: MachineToolRegistryOptions,
  invocation: HostToolInvocation,
): Promise<JsonValue> => {
  const parsed = inputs.check_job.parse(invocation.input);
  const { signal } = invocation;
  const entry = await resolveMachine(client, parsed.machineId, signal);
  const { check, reported } = await planJob(client, options, { invocation, parsed, entry });
  if (check.status === 'refused') {
    return {
      status: 'refused',
      simulated: isSimulatedMachine(entry.descriptor.capabilities),
      message: refusedText(entry, check),
      ...reported,
    };
  }
  const checks = check.checks
    .filter(({ state }) => state !== 'passed')
    .map((value) => ({
      id: value.id,
      label: value.label,
      state: value.state,
      ...(value.detail === undefined ? {} : { detail: value.detail }),
      ...(value.remedy === undefined ? {} : { remedy: remedyText(entry, value.remedy) }),
    }));
  return asJson({
    status: check.status,
    simulated: isSimulatedMachine(entry.descriptor.capabilities),
    program: check.program,
    ...(checks.length === 0 ? {} : { checks }),
    ...reported,
  });
};

/**
 * `get_print_profiles`: resolve the machine and its provider, then describe what Bambu Studio would slice with.
 */
const getPrintProfiles = async (
  client: MachineClient,
  options: MachineToolRegistryOptions,
  invocation: HostToolInvocation,
): Promise<JsonValue> => {
  const { signal } = invocation;
  const { machineId, ...rest } = inputs.get_print_profiles.parse(invocation.input);
  const entry = await resolveMachine(client, machineId, signal);
  if (fffProcessOf(entry.descriptor.capabilities) === undefined) {
    throw new Error(
      `${entry.name} has no fff process, so nothing is sliced for it; request_job runs a finished program named by artifact.`,
    );
  }
  const providers = await client.listProviders({ signal });
  const provider = providers.find(({ id }) => id === entry.providerId);
  if (provider === undefined) {
    throw new Error(`No provider ${entry.providerId} backs ${entry.name}.`);
  }
  return describePrintProfiles(options.bambuStudio ?? defaultBambuStudioEngine, {
    provider,
    machine: entry,
    ...rest,
    preferences: await readPreferences(options, provider, { signal, profileId: rest.profileId }),
  });
};

const invokeMachine = async (
  client: MachineClient,
  options: MachineToolRegistryOptions,
  invocation: HostToolInvocation & { readonly toolName: MachineToolName },
): Promise<JsonValue> => {
  const { input, signal, toolName: name } = invocation;
  switch (name) {
    case 'list_machines': {
      inputs.list_machines.parse(input);
      const { entries } = await client.list({ signal });
      return listMachinesText(entries);
    }
    case 'get_machine': {
      const { machineId } = inputs.get_machine.parse(input);
      const entry = await resolveMachine(client, machineId, signal);
      const listed =
        entry.descriptor.capabilities.jobs.type === 'supported'
          ? await client.listJobs({ machineId: entry.machineId, signal })
          : [];
      const jobs = listed.slice(0, 3);
      return describeMachineText(entry, {
        jobs: jobs.map((job) => {
          const nextStep = nextStepOf(job, entry);
          return nextStep === undefined ? { job } : { job, nextStep };
        }),
        now: (options.now ?? Date.now)(),
      });
    }
    case 'machine_action': {
      return machineAction(client, options, invocation);
    }
    case 'stop_machine': {
      return stopMachine(client, invocation);
    }
    case 'get_print_profiles': {
      return getPrintProfiles(client, options, invocation);
    }
    case 'request_job': {
      return requestJob(client, options, invocation);
    }
    case 'check_job': {
      return checkJob(client, options, invocation);
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
 * The agent causes an effect only through a declared action (`machine_action`, under the host's authority and a
 * person's approval where the action needs one), `stop_machine`, or a job a person accepts (`request_job`).
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
      .filter((name) => (name !== 'request_job' && name !== 'check_job') || options.planPrint !== undefined)
      .map((name) => definitionFor(name)),
  answerApproval: async (answer) => answerJobApproval(client, answer),
  async invoke(invocation): Promise<HostToolResult> {
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
        content: asJson(
          await invokeMachine(client, options, {
            ...invocation,
            toolName: invocation.toolName as MachineToolName,
          }),
        ),
        isError: false,
      };
    } catch (error) {
      if (invocation.signal.aborted) {
        throw invocation.signal.reason instanceof Error
          ? invocation.signal.reason
          : new DOMException('The operation was aborted.', 'AbortError');
      }
      return {
        content:
          error instanceof z.ZodError
            ? ({
                errorCode: 'TOOL_INPUT_VALIDATION_FAILED',
                message: z.prettifyError(error),
                toolName: invocation.toolName,
                toolCallId: invocation.toolCallId,
                validationErrors: error.issues.map((issue) => ({
                  path: issue.path.join('.'),
                  message: issue.message,
                })),
              } satisfies ToolInputValidationError)
            : {
                errorCode: 'MACHINE_TOOL_ERROR',
                message: error instanceof Error ? error.message : String(error),
              },
        isError: true,
      };
    }
  },
});

/**
 * Settle the job a person answered in chat: the host hands every answer to the approval `request_job` asked for
 * here, whether or not the run continues. A job no longer awaiting approval was already settled and is left alone.
 * Action approvals are not handed over: an action applies only in the attempt that recalls its approval.
 *
 * @param client - The negotiated machines facet.
 * @param answer - The tool, its job's payload and the person's answer.
 */
const answerJobApproval = async (client: MachineClient, answer: HostToolApprovalAnswer): Promise<void> => {
  const { toolName: name, payload, resolution } = answer;
  const { jobId, machineId } = payload;
  if (name !== toolName.requestJob || payload['kind'] !== 'job' || typeof jobId !== 'string') {
    return;
  }
  /* Nobody waits on the hand-over. */
  const { signal } = new AbortController();
  await settleApproval(client, {
    jobId,
    ...(typeof machineId === 'string' ? { machineId } : {}),
    resolution,
    signal,
  });
};

/** Whether a name belongs to the bounded machine registry. @internal */
export const isMachineToolName = (name: string): name is MachineToolName => toolNames.has(name);
