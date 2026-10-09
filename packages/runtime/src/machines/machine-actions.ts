/**
 * Declared machine actions: what a component can be asked to do, with its form, its hazards and who may ask.
 *
 * A provider declares each action once, on one component, as a standard family (`switch.set`, `motion.home`) or its
 * own `<vendor>.<area>.<verb>`. The host admits a request only against the installed descriptor, at the capability
 * revision the caller was shown, under the descriptor's safety floor. `stop` is not an action: every session has it,
 * nothing gates it and anyone may call it.
 *
 * @module
 */

import type { StandardJSONSchemaV1, StandardSchemaV1 } from '@standard-schema/spec';
import { z } from 'zod';

import { defineConfiguration } from '#configuration/configuration.js';
import type { ConfigurationManifestV1 } from '#configuration/index.js';
import { quantity } from '#configuration/zod.js';
import { quantityKinds, quantityReferences } from '@taucad/units/quantity';

// ───────────────────────────── Safety and qualification ─────────────────────────────

/** Closed host vocabulary of what an action can do to the world. A new hazard needs a host release. @public */
export const machineActionEffects = [
  'none',
  'observe',
  'illumination',
  'configuration',
  'coordinates',
  'motion',
  'thermal',
  'material',
  'spindle',
  'laser',
  'fluid',
  'storage',
  'run',
] as const;

/** One kind of effect an action can have on the world. @public */
export type MachineActionEffect = (typeof machineActionEffects)[number];

/**
 * Who may cause an effect. `agent`: anyone, including an agent working unattended; the host admits it only for its
 * own short low-risk list ({@link isUnattendedAction}). `approved-agent`: a person, or an agent after a person
 * approved this exact intent. `person`: a person only.
 * @public
 */
export type MachineAuthority = 'agent' | 'approved-agent' | 'person';

/**
 * The floor an action is admitted under. A provider or a host setting may raise it, never lower it. `attended` asks
 * the person to state they are at the machine; it is recorded with the operation, refused from an agent, and is a
 * statement, not a safety function.
 * @public
 */
export type MachineActionSafety = Readonly<{
  authority: MachineAuthority;
  attended: boolean;
  /** Interlock components that must report `safe`. */
  interlocks: readonly string[];
  /** The bound the machine itself enforces on a finite effect. Milliseconds. */
  maximumDuration?: number;
}>;

/** What was proven, where. Simulation never qualifies hardware. @public */
export type MachineQualificationProfile = Readonly<{
  id: string;
  environment: 'hardware' | 'simulation';
  model: string;
  /** Controller firmware versions the evidence covers. */
  firmware: readonly string[];
  /** Component ids present when it was proven. */
  attachments: readonly string[];
  /** Where the evidence record is kept. */
  evidence: string;
}>;

/** Whether a control may be enabled. `designed` and `unsupported` stay disabled with their reason. @public */
export type MachineActionQualification =
  | Readonly<{ status: 'designed' | 'unsupported'; reason: string }>
  | Readonly<{ status: 'qualified'; profileId: string }>;

/**
 * What clears a blocked check, an alert or an unavailable action: a declared action, something a person does at the
 * machine, or the machine's Stop. A `stop` remedy is for an effect only Stop can end early (e.g. a timed spindle run
 * the firmware queues to its end); `consequence` says what Stop costs (e.g. that position must be re-established),
 * and a pane renders it as a link to its Stop control, never as a second stop button.
 * @public
 */
export type MachineRemedy =
  | Readonly<{ type: 'action'; componentId: string; action: string }>
  | Readonly<{ type: 'person'; instruction: string }>
  | Readonly<{ type: 'stop'; consequence: string }>;

/**
 * What halting does on this machine: `stop`, and any action that pauses or ends a run. The pane shows it beside the
 * control. A stop sent over a network or a cable is not a safety-rated emergency stop and is never labelled as one.
 * @public
 */
export type MachineHaltOutcome = Readonly<{
  /** `finishes-queued`: moves already sent to the planner still run. Never true of `stop`. */
  motion: 'halts' | 'decelerates' | 'finishes-queued';
  spindle: 'stops' | 'keeps-turning' | 'none';
  heaters: 'off' | 'unchanged' | 'none';
  /** Whether the machine still knows where it is afterwards. */
  position: 'kept' | 'may-be-lost';
  /** Actions that make the machine usable again, in order. */
  recovery: readonly MachineRemedy[];
}>;

/** Statuses a machine can be in; see `MachineState`. @public */
export const machineStatuses = ['ready', 'active', 'held', 'alarm', 'asleep', 'unknown'] as const;

/**
 * What the controller will accept now. `alarm` is locked out until a person or a clearing action intervenes;
 * `asleep` is powered down until woken, and waking may home.
 * @public
 */
export type MachineStatus = (typeof machineStatuses)[number];

// ───────────────────────────── Descriptors ─────────────────────────────

/** One thing a component can be asked to do, with its form, its hazards and who may ask. @public */
export type MachineActionDescriptor = Readonly<{
  componentId: string;
  /** A standard family (`switch.set`, `motion.home`) or a provider's own `<vendor>.<area>.<verb>`. */
  id: string;
  version: number;
  label: string;
  description?: string;
  /** The parameters form: labels, units, choices. */
  configuration: ConfigurationManifestV1;
  effects: readonly MachineActionEffect[];
  /** `run`: needs the exact run. `idle`: needs no run. `any`: either. */
  scope: 'idle' | 'run' | 'any';
  /** Statuses in which the machine may take it. The live answer is `snapshot.availability`. */
  when: readonly MachineStatus[];
  safety: MachineActionSafety;
  qualification: MachineActionQualification;
  /** Observation groups that must be fresh. */
  requires: ReadonlyArray<Readonly<{ componentId: string; group: string }>>;
  /** What it does on this machine, in a sentence the pane shows beside a hazardous control. */
  consequence?: string;
  /** For an action that pauses or ends a run: what the machine is left doing. */
  outcome?: MachineHaltOutcome;
  /**
   * How the host learns the effect happened: a change the machine reports, only the controller's acknowledgement,
   * or nothing at all. For `observation`, a reply is a hint: an error reply settles nothing, so the operation stays
   * `confirming` until the reported state shows the change or its absence.
   */
  confirms: 'observation' | 'acknowledgement' | 'none';
}>;

/**
 * A control that acts for as long as a person holds it: a jog. The client renews the hold more often than `lease`;
 * the provider only ever sends motion that ends by itself within `bound`, so a hold that stops being renewed stops
 * the machine within that bound without any message arriving. Person only, attended, never an agent.
 * @public
 */
export type MachineHoldDescriptor = Omit<MachineActionDescriptor, 'scope' | 'when'> &
  Readonly<{
    /** A hold is admissible only while the machine is ready: never during a run, which it would cancel. */
    when: ReadonlyArray<'ready'>;
    /** How often the pressing client must renew, at the longest. Milliseconds. */
    lease: number;
    /** The longest the machine can keep moving after the last renewal. Milliseconds. */
    bound: number;
  }>;

type ProviderSchema = StandardSchemaV1 & StandardJSONSchemaV1;

/** A descriptor together with the trusted schema the host validates its parameters with. @public */
export type MachineActionDefinition = MachineActionDescriptor & Readonly<{ schema: ProviderSchema }>;

/** A hold descriptor together with its trusted schema. @public */
export type MachineHoldDefinition = MachineHoldDescriptor & Readonly<{ schema: ProviderSchema }>;

// ───────────────────────────── The standard families ─────────────────────────────

const identifier = z.string().min(1).max(64);
const none = z.strictObject({});
const temperature = quantity({
  unit: 'Cel',
  quantityKind: quantityKinds.temperature,
  space: 'point',
  reference: quantityReferences.thermodynamicAbsoluteZero,
});
const feed = quantity({ unit: 'mm/min' }).positive().meta({ title: 'Feed' });
const slot = z.strictObject({
  unitId: identifier.meta({ title: 'Material unit' }),
  slotId: identifier.meta({ title: 'Slot' }),
});
const route = z.strictObject({ slot, toolheadId: identifier.meta({ title: 'Toolhead' }) });
const preset = z.strictObject({
  profileId: identifier.meta({ title: 'Vendor filament profile' }),
  settingId: z.string().max(128).meta({ title: 'Preset setting' }),
});
const material = z.strictObject({
  materialType: identifier.meta({ title: 'Material type' }),
  // Configuration forms exclude regular expressions, so the form carries the length and the provider normalizes to
  // `#RRGGBBAA` upper case (some printers read a lower-case colour as zero).
  color: z.string().length(9).meta({ title: 'Colour', description: '#RRGGBBAA.' }),
  preset,
  nozzleTemperature: z.strictObject({
    min: temperature.min(0).max(500).meta({ title: 'Minimum nozzle temperature' }),
    max: temperature.min(0).max(500).meta({ title: 'Maximum nozzle temperature' }),
  }),
});
/** Positions and distances keyed by axis id. Millimetres for linear axes, degrees for rotary axes. */
const byAxis = z.record(identifier, z.number()).meta({ title: 'Per axis' });

// oxlint-disable-next-line eslint/max-params -- one row per standard family below reads best positionally.
const family = <Schema extends z.ZodType, Scope extends 'idle' | 'run' | 'any'>(
  schema: Schema,
  scope: Scope,
  effects: readonly MachineActionEffect[],
  authority: MachineAuthority,
  attended = false,
) => ({ schema, scope, effects, authority, attended }) as const;

/**
 * Every standard family: its parameters, when it applies, what it can do and the lowest authority it may ever be
 * admitted under. A switch, a level and an option take their meaning and hazard from the component they target, so
 * a new accessory needs no new family. A provider may narrow a family's schema, never widen it.
 * @public
 */
export const standardMachineActions = {
  'switch.set': family(z.strictObject({ on: z.boolean().meta({ title: 'On' }) }), 'any', [], 'approved-agent'),
  'level.set': family(
    z.strictObject({
      ratio: quantity({ unit: '1' })
        .min(0)
        .max(4)
        .meta({ title: 'Level', description: '1 is full, or the programmed value of an override.' }),
    }),
    'any',
    [],
    'approved-agent',
  ),
  'option.set': family(z.strictObject({ option: identifier.meta({ title: 'Option' }) }), 'any', [], 'approved-agent'),

  'run.pause': family(none, 'run', ['run'], 'agent'),
  'run.resume': family(none, 'run', ['run', 'motion'], 'approved-agent'),
  'run.cancel': family(none, 'run', ['run'], 'approved-agent'),

  'interaction.respond': family(
    z.strictObject({
      activityId: identifier.meta({ title: 'Activity' }),
      promptId: z.string().min(1).max(256).meta({ title: 'Current question' }),
      answer: identifier.meta({ title: 'Answer' }),
    }),
    'any',
    [],
    'person',
  ),

  'material.load': family(route, 'any', ['material', 'motion', 'thermal'], 'approved-agent'),
  'material.unload': family(route, 'any', ['material', 'motion', 'thermal'], 'approved-agent'),
  'material.set': family(z.strictObject({ slot, material }), 'any', ['configuration'], 'approved-agent'),
  'material.clear': family(z.strictObject({ slot }), 'any', ['configuration'], 'approved-agent'),
  'material.calibration.select': family(
    z.strictObject({ slot, profileId: identifier.meta({ title: 'Calibration profile' }) }),
    'idle',
    ['configuration'],
    'approved-agent',
  ),
  'material.calibration.save': family(
    z.discriminatedUnion('source', [
      z.strictObject({
        source: z.literal('measured'),
        activityId: identifier.meta({ title: 'Calibration run' }),
        resultId: identifier.meta({ title: 'Result' }),
        name: z.string().min(1).max(40).meta({ title: 'Name' }),
      }),
      z.strictObject({
        source: z.literal('manual'),
        name: z.string().min(1).max(40).meta({ title: 'Name' }),
        preset,
        nozzleId: identifier.meta({ title: 'Nozzle' }),
        pressureAdvance: z.number().gt(0).lt(2).meta({ title: 'Pressure advance (K)' }),
      }),
    ]),
    'idle',
    ['configuration', 'storage'],
    'approved-agent',
  ),
  'material.calibration.delete': family(
    z.strictObject({ profileId: identifier.meta({ title: 'Calibration profile' }) }),
    'idle',
    ['storage'],
    'approved-agent',
  ),
  'material.calibration.run': family(
    z.strictObject({
      method: z.enum(['pressure-advance', 'flow-ratio']).meta({ title: 'What to measure' }),
      slots: z.array(slot).min(1).max(16).meta({ title: 'Slots' }),
      nozzleId: identifier.meta({ title: 'Nozzle' }),
    }),
    'idle',
    ['material', 'motion', 'thermal', 'storage'],
    'approved-agent',
  ),

  'controller.unlock': family(none, 'idle', ['configuration'], 'person', true),
  'controller.wake': family(none, 'idle', ['motion'], 'person', true),
  'motion.home': family(
    z.strictObject({
      axes: z.array(identifier).max(9).optional().meta({ title: 'Axes', description: 'All axes when absent.' }),
    }),
    'idle',
    ['motion', 'coordinates'],
    'person',
    true,
  ),
  'motion.jog': family(
    z.strictObject({
      axis: identifier.meta({ title: 'Axis' }),
      distance: z
        .number()
        .meta({ title: 'Distance', description: 'Signed. Millimetres, or degrees for a rotary axis.' }),
      feed,
    }),
    'idle',
    ['motion'],
    'person',
    true,
  ),
  'motion.move': family(
    z.strictObject({
      frame: z.enum(['machine', 'work']).meta({ title: 'Coordinates' }),
      position: byAxis,
      feed: feed.optional(),
    }),
    'idle',
    ['motion'],
    'person',
    true,
  ),
  'work-offset.select': family(
    z.strictObject({ offset: identifier.meta({ title: 'Work offset' }) }),
    'idle',
    ['coordinates'],
    'person',
  ),
  'work-offset.set': family(
    z.strictObject({ offset: identifier.meta({ title: 'Work offset' }), position: byAxis }),
    'idle',
    ['coordinates'],
    'person',
    true,
  ),
  'probe.run': family(
    z.strictObject({ cycle: identifier.meta({ title: 'Cycle' }) }),
    'idle',
    ['motion', 'coordinates'],
    'person',
    true,
  ),
  'tool.change': family(
    z.strictObject({ tool: z.number().int().min(0).max(9999).meta({ title: 'Tool' }) }),
    'idle',
    ['motion'],
    'person',
    true,
  ),
  'tool.measure': family(none, 'idle', ['motion', 'coordinates'], 'person', true),
  'spindle.set': family(
    z.discriminatedUnion('mode', [
      z.strictObject({ mode: z.literal('off') }),
      z.strictObject({
        mode: z.enum(['clockwise', 'counterclockwise']),
        speed: quantity({ unit: '/min', symbol: 'rpm' })
          .positive()
          .optional()
          .meta({ title: 'Speed', description: 'Absent for a switched spindle: the dial on the tool sets it.' }),
        duration: quantity({ unit: 's' }).positive().meta({ title: 'Stops by itself after' }),
      }),
    ]),
    'idle',
    ['spindle'],
    'person',
    true,
  ),
} as const;

/** The id of one standard action family. @public */
export type StandardMachineActionId = keyof typeof standardMachineActions;

/** The standard holds. A held jog moves one axis one way until it is released. @public */
export const standardMachineHolds = {
  'motion.jog': {
    schema: z.strictObject({
      axis: identifier.meta({ title: 'Axis' }),
      direction: z.union([z.literal(1), z.literal(-1)]).meta({ title: 'Direction' }),
      feed,
    }),
    effects: ['motion'] as const,
  },
} as const;

/** Parameters of one standard family, as a caller sends them. @public */
export type StandardMachineActionParameters<Id extends StandardMachineActionId> = z.input<
  (typeof standardMachineActions)[Id]['schema']
>;

/** Parameters of the standard held jog. @public */
export type MachineJogHoldParameters = z.input<(typeof standardMachineHolds)['motion.jog']['schema']>;

/**
 * The host's whole low-risk list: the only places an unattended agent may act, keyed by component kind and family.
 * Providers cannot add to it.
 */
const unattended = new Set(['light:switch.set', 'light:level.set', 'speed-profile:option.set']);
/** Low-risk only on a printer: pausing a print parks the head; pausing a cut leaves a spinning tool in the work. */
const unattendedOnPrinter = new Set(['controller:run.pause']);
const lowRisk = (entry: string): boolean => unattended.has(entry) || unattendedOnPrinter.has(entry);

/**
 * Whether an agent may use an action without a person approving it.
 * @param componentKind - The kind of the component the action targets.
 * @param descriptor - The installed descriptor.
 * @param processes - The machine's declared processes; pausing is unattended only with an `fff` process and no
 * `milling`. Absent, no process is assumed and a pause needs approval.
 * @returns True only for the host's low-risk list, on a descriptor whose floor is `agent`.
 * @public
 */
export const isUnattendedAction = (
  componentKind: string,
  descriptor: MachineActionDescriptor,
  processes: ReadonlyArray<Readonly<{ type: string }>> = [],
): boolean => {
  if (descriptor.safety.authority !== 'agent') {
    return false;
  }
  const entry = `${componentKind}:${descriptor.id}`;
  return (
    unattended.has(entry) ||
    (unattendedOnPrinter.has(entry) &&
      processes.some((process) => process.type === 'fff') &&
      !processes.some((process) => process.type === 'milling'))
  );
};

// ───────────────────────────── Authoring helpers ─────────────────────────────

const designed: MachineActionQualification = { status: 'designed', reason: 'Not yet qualified on this hardware.' };

type DescribedAction = Omit<MachineActionDescriptor, 'configuration' | 'qualification'> &
  Readonly<{ qualification?: MachineActionQualification }>;

/**
 * One provider-owned action from its schema. The id must be namespaced (`acme.spool.read-tag`).
 * @param action - Everything but the form.
 * @param schema - The parameters schema; the host validates every request with it.
 * @returns The definition, `designed` until the provider names a qualification.
 * @public
 */
export const defineMachineAction = (action: DescribedAction, schema: ProviderSchema): MachineActionDefinition => {
  if (!(action.id in standardMachineActions) && action.id.split('.').length < 2) {
    throw new TypeError(`defineMachineAction: ${action.id} is neither a standard family nor namespaced.`);
  }
  const configuration = defineConfiguration({
    id: `${action.componentId}.${action.id}`,
    version: String(action.version),
    schema,
    ui: { version: 1, rjsf: {} },
  });
  return Object.freeze({
    ...action,
    qualification: action.qualification ?? designed,
    configuration: configuration.manifest,
    schema,
  });
};

/**
 * A standard family on one component. Effects and safety start at the family's floor; a provider adds to them and
 * may only raise the authority.
 * @param input - The family, its component and what this machine adds.
 * @returns The definition.
 * @public
 */
export const standardMachineAction = (
  input: Readonly<{
    id: StandardMachineActionId;
    componentId: string;
    /** The target component's kind. A family on the host's low-risk list for this kind starts at `agent`. */
    componentKind?: string;
    label: string;
    description?: string;
    when: readonly MachineStatus[];
    requires?: MachineActionDescriptor['requires'];
    effects?: readonly MachineActionEffect[];
    safety?: Partial<MachineActionSafety>;
    consequence?: string;
    outcome?: MachineHaltOutcome;
    confirms?: MachineActionDescriptor['confirms'];
    qualification?: MachineActionQualification;
    /** A narrower schema than the family's. */
    schema?: ProviderSchema;
  }>,
): MachineActionDefinition => {
  const base = standardMachineActions[input.id];
  const floor = lowRisk(`${input.componentKind}:${input.id}`) ? 'agent' : base.authority;
  const authority = raise(floor, input.safety?.authority);
  return defineMachineAction(
    {
      componentId: input.componentId,
      id: input.id,
      version: 1,
      label: input.label,
      ...(input.description === undefined ? {} : { description: input.description }),
      effects: [...new Set([...base.effects, ...(input.effects ?? [])])],
      scope: base.scope,
      when: input.when,
      safety: {
        interlocks: [],
        ...input.safety,
        authority,
        attended: base.attended || input.safety?.attended === true,
      },
      requires: input.requires ?? [],
      ...(input.consequence === undefined ? {} : { consequence: input.consequence }),
      ...(input.outcome === undefined ? {} : { outcome: input.outcome }),
      confirms: input.confirms ?? 'observation',
      ...(input.qualification === undefined ? {} : { qualification: input.qualification }),
    },
    input.schema ?? base.schema,
  );
};

/**
 * The standard held jog on a motion component.
 * @param input - The component and this machine's lease and bound.
 * @returns The hold definition.
 * @public
 */
export const machineJogHold = (
  input: Readonly<{
    componentId: string;
    lease: number;
    bound: number;
    interlocks?: readonly string[];
    qualification?: MachineActionQualification;
    schema?: ProviderSchema;
  }>,
): MachineHoldDefinition => {
  const { scope: _scope, ...definition } = defineMachineAction(
    {
      componentId: input.componentId,
      id: 'motion.jog',
      version: 1,
      label: 'Jog while held',
      effects: ['motion'],
      scope: 'idle',
      when: ['ready'],
      safety: { authority: 'person', attended: true, interlocks: input.interlocks ?? [] },
      requires: [{ componentId: input.componentId, group: 'position' }],
      confirms: 'observation',
      ...(input.qualification === undefined ? {} : { qualification: input.qualification }),
    },
    input.schema ?? standardMachineHolds['motion.jog'].schema,
  );
  return Object.freeze({ ...definition, when: ['ready'] as const, lease: input.lease, bound: input.bound });
};

const authorityRank: Readonly<Record<MachineAuthority, number>> = { agent: 0, 'approved-agent': 1, person: 2 };
const raise = (floor: MachineAuthority, requested: MachineAuthority | undefined): MachineAuthority =>
  requested !== undefined && authorityRank[requested] > authorityRank[floor] ? requested : floor;

/**
 * The serializable descriptor of a definition: everything but the trusted schema.
 * @param definition - An action or hold definition.
 * @returns The descriptor.
 * @public
 */
export const machineActionDescriptorOf = <Definition extends Readonly<{ schema: unknown }>>(
  definition: Definition,
): Omit<Definition, 'schema'> => {
  const { schema: _schema, ...descriptor } = definition;
  return descriptor;
};

// ───────────────────────────── Failures ─────────────────────────────

/** Why nothing was sent, or why the machine refused. Structured; never parsed from exception text. @public */
export const machineFailureCodes = [
  'MACHINE_UNAVAILABLE',
  'MACHINE_ACTION_UNDECLARED',
  'MACHINE_ACTION_UNQUALIFIED',
  'MACHINE_ACTION_UNSUPPORTED',
  'MACHINE_ACTION_VERSION_UNSUPPORTED',
  'MACHINE_ACTION_CAPABILITIES_CHANGED',
  'MACHINE_ACTION_PARAMETERS_INVALID',
  'MACHINE_ACTION_STALE_OBSERVATION',
  'MACHINE_ACTION_STALE_RUN',
  'MACHINE_ACTION_RUN_ACTIVE',
  'MACHINE_ACTION_PRECONDITION_FAILED',
  'MACHINE_ACTION_PROMPT_STALE',
  'MACHINE_ACTION_PROMPT_CONSUMED',
  'MACHINE_ACTION_MATERIAL_READ_ONLY',
  'MACHINE_ACTION_INTERLOCK',
  'MACHINE_ACTION_ATTENDANCE_REQUIRED',
  'MACHINE_ACTION_PERSON_REQUIRED',
  'MACHINE_ACTION_APPROVAL_REQUIRED',
  'MACHINE_ACTION_BUSY',
  'MACHINE_ACTION_ABORTED',
  'MACHINE_ACTION_PROVIDER_REJECTED',
  'MACHINE_OPERATION_ID_CONFLICT',
  'MACHINE_HOLD_ENDED',
  'MACHINE_JOB_UNSUPPORTED',
  'MACHINE_JOB_CHECK_BLOCKED',
  'MACHINE_JOB_ATTESTATION_REQUIRED',
  'MACHINE_JOB_SETUP_CHANGED',
  'MACHINE_JOB_PREPARATION_EXPIRED',
  'MACHINE_PREPARATION_FAILED',
  'MACHINE_TRANSFER_UNCONFIRMED',
  'HOST_RESTARTED',
  'MACHINE_HOST_CLOSING',
] as const;

/** One structured failure code. @public */
export type MachineFailureCode = (typeof machineFailureCodes)[number];

/**
 * Why a job or a transfer failed: a host code, or a provider's own under `MACHINE_JOB_` or `MACHINE_TRANSFER_`. One
 * shape for the job check's refusal and the job's `failure`. A provider's own code is kept when its check or
 * preparation refuses; a transfer or start the machine rejects is recorded as a receipt, whose code is always a
 * `MachineFailureCode` (`MACHINE_ACTION_PROVIDER_REJECTED`, with the provider's code in its message).
 * @public
 */
export type MachineJobFailureCode = MachineFailureCode | `MACHINE_JOB_${string}` | `MACHINE_TRANSFER_${string}`;

const failureCodes: ReadonlySet<string> = new Set(machineFailureCodes);
/** A provider's own job code: upper case under `MACHINE_JOB_` or `MACHINE_TRANSFER_`, at most 64 characters. */
const providerJobCode = /^MACHINE_(?:JOB|TRANSFER)_[A-Z0-9_]{1,48}$/u;

/**
 * Whether a code may name a job's or a job check's failure, so a host keeps it rather than mapping it to its own.
 * @param code - Any code, such as a provider's refusal.
 * @returns True for a host code or a provider's namespaced job code.
 * @public
 */
export const isMachineJobFailureCode = (code: string): code is MachineJobFailureCode =>
  failureCodes.has(code) || providerJobCode.test(code);

/** A refusal a person or an agent can act on. @public */
export type MachineFailure = Readonly<{
  code: MachineFailureCode;
  message: string;
  issues?: ReadonlyArray<Readonly<{ path: string; message: string }>>;
}>;
