/**
 * Compact text for the machine tools: what an agent reads about a machine, its actions and its jobs. Plain lines,
 * never the raw directory entry, so a machine costs a few hundred tokens rather than its whole manifest.
 *
 * @module
 */

import { checkMachineAction, fffProcessOf, isSimulatedMachine } from '@taucad/runtime/machine';
import type {
  MachineActionDescriptor,
  MachineCheck,
  MachineComponentValue,
  MachineDirectoryEntry,
  MachineHaltOutcome,
  MachineInstalledCapabilities,
  MachineJob,
  MachineRemedy,
  MachineRun,
} from '@taucad/runtime/machine';

/** A duration in words. @param milliseconds - The duration. @returns "about 1 h 5 min", or "under a minute". */
export const formatDuration = (milliseconds: number): string => {
  const minutes = Math.round(milliseconds / 60_000);
  if (minutes < 1) {
    return 'under a minute';
  }
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return `about ${hours === 0 ? `${String(rest)} min` : `${String(hours)} h ${String(rest)} min`}`;
};

/** Text ending in one full stop. @param text - A clause or a sentence. @returns The sentence. */
export const sentence = (text: string): string => (/[.!?]$/u.test(text) ? text : `${text}.`);

/**
 * What clears a refusal, an alert or a check, in words an agent can act on.
 * @param entry - The machine, for the action's label.
 * @param remedy - The remedy.
 * @returns "Home (machine_action motion motion.home)", the person's instruction, or Stop with what it costs.
 */
export const remedyText = (entry: MachineDirectoryEntry, remedy: MachineRemedy): string => {
  switch (remedy.type) {
    case 'person': {
      return `a person: ${remedy.instruction}`;
    }
    case 'stop': {
      return `Stop the machine (stop_machine): ${remedy.consequence}`;
    }
    case 'action': {
      const label = entry.descriptor.capabilities.actions.find(
        ({ componentId, id }) => componentId === remedy.componentId && id === remedy.action,
      )?.label;
      return `${label ?? remedy.action} (machine_action ${remedy.componentId} ${remedy.action})`;
    }
  }
};

/**
 * What halting leaves the machine doing.
 * @param entry - The machine.
 * @param outcome - The declared outcome.
 * @returns One sentence.
 */
export const outcomeText = (entry: MachineDirectoryEntry, outcome: MachineHaltOutcome): string => {
  const parts = [
    `motion ${outcome.motion}`,
    ...(outcome.spindle === 'none' ? [] : [`spindle ${outcome.spindle}`]),
    ...(outcome.heaters === 'none' ? [] : [`heaters ${outcome.heaters}`]),
    `position ${outcome.position === 'kept' ? 'kept' : 'may be lost'}`,
  ];
  const recovery = outcome.recovery.map((remedy) => remedyText(entry, remedy));
  return `Leaves ${parts.join(', ')}${recovery.length === 0 ? '' : `; to recover: ${recovery.join(', then ')}`}.`;
};

type JsonSchemaNode = Readonly<{
  type?: unknown;
  properties?: Readonly<Record<string, JsonSchemaNode>>;
  required?: readonly string[];
  enum?: readonly unknown[];
  const?: unknown;
  oneOf?: readonly JsonSchemaNode[];
  anyOf?: readonly JsonSchemaNode[];
  items?: JsonSchemaNode;
  minimum?: number;
  maximum?: number;
  'x-tau-unit'?: string;
}>;

/**
 * A parameters schema as one short signature: `{on: boolean}`, `{ratio: number 1 0..4}`.
 * @param schema - A draft-07 JSON Schema.
 * @returns The signature.
 */
export const parameterSignature = (schema: unknown): string => {
  const node = (schema ?? {}) as JsonSchemaNode;
  const union = node.oneOf ?? node.anyOf;
  if (union !== undefined) {
    return union.map((member) => parameterSignature(member)).join(' | ');
  }
  if (node.const !== undefined) {
    return JSON.stringify(node.const);
  }
  if (node.enum !== undefined) {
    return node.enum.map((value) => JSON.stringify(value)).join('|');
  }
  if (node.type === 'object') {
    const required = new Set(node.required ?? []);
    const fields = Object.entries(node.properties ?? {}).map(
      ([key, value]) => `${key}${required.has(key) ? '' : '?'}: ${parameterSignature(value)}`,
    );
    return `{${fields.join(', ')}}`;
  }
  if (node.type === 'array') {
    return `${parameterSignature(node.items)}[]`;
  }
  if (node.type === 'number' || node.type === 'integer') {
    const unit = node['x-tau-unit'] === undefined ? '' : ` ${node['x-tau-unit']}`;
    const range =
      node.minimum !== undefined && node.maximum !== undefined
        ? ` ${String(node.minimum)}..${String(node.maximum)}`
        : '';
    return `number${unit}${range}`;
  }
  return typeof node.type === 'string' ? node.type : 'value';
};

const quantityText = (value: unknown): string =>
  typeof value === 'object' && value !== null && 'value' in value && 'unit' in value
    ? `${String(value.value)} ${String(value.unit)}`
    : String(value);

const percent = (fraction: number): string => `${String(Math.round(fraction * 100))}%`;

/**
 * What jobs a machine takes from Tau and what starting one asks of a person, in one line.
 * @param jobs - The machine's job capability.
 * @returns "Jobs: accepts additive.fff (application/vnd.bambulab.gcode-3mf); stored, then started by Tau …".
 */
const jobsText = (jobs: MachineInstalledCapabilities['jobs']): string => {
  if (jobs.type === 'unsupported') {
    return 'Jobs: this machine takes none from Tau.';
  }
  const accepts = jobs.accepts.map(({ technology, mediaType }) => `${technology} (${mediaType})`).join(', ');
  const start =
    jobs.start === 'remote' ? 'started by Tau once a person accepts it' : 'started by a person at the machine';
  const confirms = [
    ...jobs.attestations.map(({ label }) => label),
    ...(jobs.safety.attended ? ['they are at the machine'] : []),
  ];
  return `Jobs (request_job): accepts ${accepts}; ${jobs.delivery === 'stored' ? 'sent whole' : 'streamed'}, then ${start}${confirms.length === 0 ? '' : `; the person confirms: ${confirms.join('; ')}`}.`;
};

/** One component's reported value in a few words. */
const valueText = (value: MachineComponentValue): string => {
  switch (value.kind) {
    case 'switch': {
      return value.on ? 'on' : 'off';
    }
    case 'level': {
      return percent(value.ratio);
    }
    case 'option': {
      return value.option;
    }
    case 'readings': {
      return value.values
        .map(
          (reading) =>
            `${reading.label} ${quantityText(reading.value)}${reading.target === undefined ? '' : ` → ${quantityText(reading.target)}`}`,
        )
        .join(', ');
    }
    case 'interlock': {
      return value.state;
    }
    case 'motion': {
      const axes = Object.entries(value.position.work)
        .map(([axis, position]) => `${axis}=${String(position)}`)
        .join(' ');
      return `position ${value.trust}; work ${axes} (${value.workOffset.id})${value.limits.length === 0 ? '' : `; limits pressed ${value.limits.join(',')}`}`;
    }
    case 'spindle': {
      return value.mode === 'off' ? 'off' : `${value.mode} ${String(value.commanded)} rpm`;
    }
    case 'tools': {
      return `${value.current === undefined ? 'no tool' : `tool ${String(value.current)}`}; ${String(value.table.rows.length)} in the table`;
    }
    case 'probe': {
      return `${value.connected ? 'connected' : 'not connected'}${value.triggered ? ', triggered' : ''}`;
    }
    case 'material-system': {
      return value.slots
        .map(
          ({ slot, state, material, remainingPercent }) =>
            `${slot.unitId}/${slot.slotId} ${state}${material === undefined ? '' : ` ${material.materialType} ${material.color}`}${remainingPercent === undefined ? '' : ` ${String(remainingPercent)}% left`}`,
        )
        .join('; ');
    }
    case 'vendor': {
      return value.type;
    }
  }
};

/**
 * What a simulated machine adds to its name, so the agent never tells the person a real machine is working.
 * @param entry - The machine.
 * @returns " (simulated, no machine attached)", or '' for a real one.
 */
export const simulatedText = (entry: Pick<MachineDirectoryEntry, 'descriptor'>): string =>
  isSimulatedMachine(entry.descriptor.capabilities) ? ' (simulated, no machine attached)' : '';

/**
 * A 3D printer's build volume and plate ids, which `request_job` checks a model against and names a plate by.
 * @param capabilities - The installed capabilities.
 * @returns "Process fff: build volume 256×256×256 mm; plates textured-pei, cool.", or undefined for no fff process.
 */
const fffText = (capabilities: MachineInstalledCapabilities): string | undefined => {
  const fff = fffProcessOf(capabilities);
  if (fff === undefined) {
    return undefined;
  }
  const { x, y, z } = fff.geometry.buildVolume;
  return `Process fff: build volume ${String(x)}×${String(y)}×${String(z)} ${fff.geometry.unit}; plates ${fff.bed.plates.map(({ id }) => id).join(', ')}.`;
};

/** A run stage in words, or nothing for a bare vendor stage number, which says nothing to a reader. */
const readableStage = (stage: string | undefined): string | undefined =>
  stage === undefined || /^\d+$/u.test(stage) ? undefined : stage;

const runText = (run: MachineRun): string => {
  const { progress } = run;
  const counters = progress.counters
    .map(({ label, current, total }) => `${label} ${String(current)}${total === undefined ? '' : `/${String(total)}`}`)
    .join(', ');
  const facts = [
    ...(progress.fraction === undefined ? [] : [percent(progress.fraction)]),
    ...(counters === '' ? [] : [counters]),
    ...(progress.remaining === undefined ? [] : [`${formatDuration(progress.remaining)} left`]),
  ];
  const paused =
    run.paused === undefined
      ? ''
      : ` (paused by ${run.paused.by}${run.paused.reason === undefined ? '' : `: ${run.paused.reason}`})`;
  const stage = readableStage(run.stage);
  return `Run ${run.runId}: ${run.program?.name ?? 'program'} ${run.state}${paused}${facts.length === 0 ? '' : `, ${facts.join(', ')}`}${stage === undefined ? '' : `; ${stage}`}${run.origin === 'external' ? '; not started from Tau' : ''}.`;
};

/**
 * One check that has not passed, in words.
 * @param entry - The machine.
 * @param check - The check.
 * @returns "Plate clear: blocked (…); clears with …".
 */
export const checkText = (entry: MachineDirectoryEntry, check: MachineCheck): string =>
  `${check.label}: ${check.state}${check.detail === undefined ? '' : ` (${check.detail})`}${check.remedy === undefined ? '' : `; clears with ${remedyText(entry, check.remedy)}`}`;

/**
 * Whether the agent may use one action now, and what it does.
 * @param entry - The machine.
 * @param action - The declared action.
 * @param now - Host-adjusted wall-clock milliseconds.
 * @returns One line.
 */
const actionText = (entry: MachineDirectoryEntry, action: MachineActionDescriptor, now: number): string => {
  const check = checkMachineAction({
    entry,
    componentId: action.componentId,
    action: action.id,
    caller: 'agent',
    attended: false,
    now,
  });
  const personOnly = action.safety.authority === 'person' || action.safety.attended;
  const signature = parameterSignature(action.configuration.legacyProjection.inputSchema);
  const what = [
    ...(action.consequence === undefined
      ? action.description === undefined
        ? []
        : [action.description]
      : [action.consequence]),
    ...(action.outcome === undefined ? [] : [outcomeText(entry, action.outcome)]),
  ].join(' ');
  const availability =
    check.status === 'available'
      ? 'You may use it now.'
      : check.status === 'approval-required'
        ? 'Needs a person’s approval; you may ask.'
        : personOnly
          ? 'A person at the machine only.'
          : `Unavailable: ${check.message}${check.remedy === undefined ? '' : ` Clears with ${sentence(remedyText(entry, check.remedy))}`}`;
  return `- ${action.componentId} ${action.id}${personOnly || signature === '{}' ? '' : ` ${signature}`}: ${action.label}.${what === '' ? '' : ` ${what}`} ${availability}`;
};

/** What the agent reads when nothing is bound: binding is the person's, in Settings. */
export const noMachineText = 'No machine is bound on this computer; the person adds one in Settings › Machines.';

/**
 * One line per bound machine.
 * @param entries - The directory.
 * @returns The list, or how to bind one.
 */
export const listMachinesText = (entries: readonly MachineDirectoryEntry[]): string =>
  entries.length === 0
    ? noMachineText
    : entries
        .map((entry) => {
          const { machineId, name, descriptor, snapshot, freshness } = entry;
          const run =
            snapshot.run === undefined
              ? ''
              : `, run ${snapshot.run.state}${snapshot.run.progress.fraction === undefined ? '' : ` ${percent(snapshot.run.progress.fraction)}`}`;
          return `- ${machineId}: ${name} (${descriptor.vendor} ${descriptor.model})${simulatedText(entry)}, ${snapshot.connection}${freshness === 'stale' ? ' (stale)' : ''}, ${snapshot.state.status}${run}`;
        })
        .join('\n');

/**
 * Everything an agent needs about one machine, in lines.
 * @param entry - The machine as last observed.
 * @param context - Its recent jobs with their next steps, and the time.
 * @returns The description.
 */
export const describeMachineText = (
  entry: MachineDirectoryEntry,
  context: Readonly<{ jobs: ReadonlyArray<Readonly<{ job: MachineJob; nextStep?: string }>>; now: number }>,
): string => {
  const { descriptor, snapshot } = entry;
  const { capabilities } = descriptor;
  const lines = [
    `${entry.name} (${entry.machineId}): ${descriptor.vendor} ${descriptor.model}${simulatedText(entry)}, firmware ${descriptor.firmware}. ${snapshot.connection}${entry.freshness === 'stale' ? ' (stale)' : ''}, ${snapshot.state.status}${snapshot.state.reason === undefined ? '' : `: ${snapshot.state.reason}`}. Observed ${snapshot.observedAt}.`,
  ];
  if (snapshot.run !== undefined) {
    lines.push(runText(snapshot.run));
  }
  lines.push('Components:');
  for (const component of capabilities.components) {
    const values = snapshot.components
      .filter(({ componentId }) => componentId === component.id)
      .map((observation) =>
        observation.knowledge === 'known' ? valueText(observation.value) : `unknown (${observation.reason})`,
      )
      .filter((text) => text !== '');
    lines.push(
      `- ${component.id} (${component.kind}, ${component.label})${values.length === 0 ? '' : `: ${values.join('; ')}`}`,
    );
  }
  if (snapshot.activities.length > 0) {
    lines.push('Activities:');
    for (const activity of snapshot.activities) {
      const awaiting =
        activity.awaiting === undefined
          ? ''
          : activity.awaiting.kind === 'instruction'
            ? `; waiting for a person: ${activity.awaiting.label}`
            : `; asks "${activity.awaiting.label}" (${activity.awaiting.answers.map(({ label }) => label).join(' / ')}), which a person answers`;
      lines.push(
        `- ${activity.label} on ${activity.componentId}: ${activity.state}${activity.progress === undefined ? '' : ` ${percent(activity.progress)}`}${awaiting}${activity.message === undefined ? '' : `; ${activity.message}`}`,
      );
    }
  }
  if (snapshot.alerts.length > 0) {
    lines.push('Alerts:');
    for (const alert of snapshot.alerts) {
      const remedies = (alert.remedies ?? []).map((remedy) => remedyText(entry, remedy));
      lines.push(
        `- ${alert.severity ?? 'alert'} ${alert.code}${alert.message === undefined ? '' : `: ${alert.message}`}; blocks ${alert.blocks}${remedies.length === 0 ? '' : `; clears with ${remedies.join(', then ')}`}`,
      );
    }
  }
  const checks = snapshot.checks.filter(({ state }) => state !== 'passed');
  if (checks.length > 0) {
    lines.push('Checks:', ...checks.map((check) => `- ${checkText(entry, check)}`));
  }
  if (capabilities.actions.length > 0) {
    lines.push('Actions (machine_action componentId action parameters):');
    lines.push(...capabilities.actions.map((action) => actionText(entry, action, context.now)));
  }
  lines.push(`Stop (stop_machine, always open to you): ${outcomeText(entry, capabilities.stop)}`);
  lines.push(jobsText(capabilities.jobs));
  const fff = fffText(capabilities);
  if (fff !== undefined) {
    lines.push(fff);
  }
  if (capabilities.jobs.type === 'supported' && context.jobs.length > 0) {
    lines.push('Recent jobs:');
    for (const { job, nextStep } of context.jobs) {
      lines.push(`- ${job.jobId} ${job.program.name}: ${job.state}${nextStep === undefined ? '' : `. ${nextStep}`}`);
    }
  }
  const operations = snapshot.operations.slice(-5);
  if (operations.length > 0) {
    lines.push('Recent operations:');
    lines.push(
      ...operations.map(
        (operation) =>
          `- ${operation.operationId} ${operation.action?.label ?? operation.kind}: ${operation.state}${operation.requestedBy === undefined ? '' : ` (by ${operation.requestedBy.label})`}`,
      ),
    );
  }
  return lines.join('\n');
};
