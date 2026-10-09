/**
 * Live machine state: what one machine reports, component by component, with each observation's own age.
 *
 * One rule for numbers: every physical value is a Quantity or a field with one documented unit. A controller's own
 * unit mode (inches, Fahrenheit) never reaches this contract. A component's state lives only in `components`.
 *
 * @module
 */

import type { Quantity } from '@taucad/units/quantity';
import { z } from 'zod';

import { machineActionEffects, machineFailureCodes, machineStatuses } from '#machines/machine-actions.js';
import type {
  MachineActionEffect,
  MachineActionSafety,
  MachineFailure,
  MachineRemedy,
  MachineStatus,
} from '#machines/machine-actions.js';
import type { MachineOperation } from '#machines/machine-jobs.js';
import { machineActionSafetySchema, machineRemedySchema } from '#machines/machine-manifest.js';

// oxlint-disable-next-line typescript/no-restricted-types -- JSON has null.
type JsonValue = string | number | boolean | null | readonly JsonValue[] | { readonly [key: string]: JsonValue };

/** The normalized state plus the controller's own words for it. @public */
export type MachineState = Readonly<{
  status: MachineStatus;
  /** Why it is held or in alarm, as a sentence. */
  reason?: string;
  /** The controller's own state text (`Hold:1`, `PAUSE`), shown as detail and never branched on. */
  native?: string;
}>;

/** One counter of a run's progress. A printer counts layers; a router counts program lines and tools. @public */
export type MachineRunCounter = Readonly<{
  id: string;
  label: string;
  current: number;
  total?: number;
}>;

/** Progress as far as the machine or the host knows it. @public */
export type MachineRunProgress = Readonly<{
  /** What the numbers count: work done, work sent to the controller's queue, or a host estimate. */
  basis: 'executed' | 'queued' | 'estimated';
  /** 0 to 1. */
  fraction?: number;
  /** Time since the run started. Milliseconds. */
  elapsed?: number;
  /** The machine's or the host's estimate of the time left. Milliseconds. */
  remaining?: number;
  counters: readonly MachineRunCounter[];
}>;

/** The run in progress or just ended. @public */
export type MachineRun = Readonly<{
  /** The machine's id for the run, or the host's when the machine has none (a streamed run). */
  runId: string;
  /** The Tau job that started it, when the start is proven; absent for a run started at the machine. */
  jobId?: string;
  origin: 'tau' | 'external';
  /** `streamed`: this host is feeding the program and must stay connected until the run ends. */
  delivery: 'stored' | 'streamed';
  /**
   * `unknown`: the machine no longer says, such as a streamed run whose feeding session was lost. The job that
   * started it records that as `interrupted` (`MachineJob.run.outcome`); the run itself stays `unknown`.
   */
  state: 'starting' | 'running' | 'paused' | 'finishing' | 'completed' | 'cancelled' | 'failed' | 'unknown';
  /** Who or what paused it: a person, an agent, a stop in the program, or the machine itself. */
  paused?: Readonly<{ by: 'person' | 'agent' | 'program' | 'machine'; reason?: string }>;
  program?: Readonly<{ name: string }>;
  startedAt?: string;
  endedAt?: string;
  progress: MachineRunProgress;
  /** A readable phrase for what the machine is doing now; never a bare vendor stage number. */
  stage?: string;
}>;

/** A material slot's stable address within one material system; no vendor sentinel numbers. @public */
export type MaterialSlotAddress = Readonly<{ unitId: string; slotId: string }>;

/** What a slot holds, as a person or a tag described it. @public */
export type SlotMaterial = Readonly<{
  materialType: string;
  /** `#RRGGBBAA`, upper case. */
  color: string;
  preset: Readonly<{ profileId: string; settingId: string }>;
  nozzleTemperature?: Readonly<{ min: Quantity; max: Quantity }>;
  brand?: string;
  /** The calibration profile bound to this slot, or the machine's default when none is. */
  calibration: Readonly<{ type: 'default' }> | Readonly<{ type: 'profile'; profileId: string }>;
}>;

/** One row of a machine-held pressure-advance (K) calibration table. @public */
export type CalibrationProfile = Readonly<{
  profileId: string;
  name: string;
  preset: SlotMaterial['preset'];
  nozzleId: string;
  /** Pressure advance (K), dimensionless. */
  pressureAdvance: number;
}>;

/** A table the machine keeps and several clients edit. `revision` changes on every write by anyone. @public */
export type MachineTable<Row> = Readonly<{ revision: string; capacity?: number; rows: readonly Row[] }>;

/** One slot. Known empty, unset metadata and an unknown observation are distinct facts. @public */
export type MaterialSlotSnapshot = Readonly<{
  slot: MaterialSlotAddress;
  state: 'empty' | 'loaded' | 'unknown';
  identifiedBy: 'tag' | 'person' | 'unset' | 'unknown';
  material?: SlotMaterial;
  remainingPercent?: number;
  /** Whether Tau may edit the metadata now, and why not. */
  editing: Readonly<{ allowed: boolean; duringRun: boolean; reason?: string }>;
}>;

/** One reading of a component: a temperature with its target, a fan speed, a signal strength. @public */
export type MachineReading = Readonly<{
  id: string;
  label: string;
  value: Quantity | number | string | boolean;
  /** The commanded value, for a reading the machine drives toward one. */
  target?: Quantity | number;
}>;

/** One tool as the controller knows it. Diameter and length offset are millimetres. @public */
export type MachineTool = Readonly<{
  number: number;
  pocket?: number;
  description?: string;
  diameter?: number;
  lengthOffset?: number;
  measured: boolean;
}>;

/** What one component reports. @public */
export type MachineComponentValue =
  | Readonly<{ kind: 'switch'; on: boolean }>
  | Readonly<{ kind: 'level'; ratio: number }>
  | Readonly<{ kind: 'option'; option: string }>
  | Readonly<{ kind: 'readings'; values: readonly MachineReading[] }>
  | Readonly<{ kind: 'interlock'; state: 'safe' | 'unsafe' | 'unknown' }>
  | Readonly<{
      kind: 'motion';
      /** Per axis id. */
      homed: Readonly<Record<string, boolean>>;
      /** Found by homing, kept since, lost, or not known since connecting. */
      trust: 'homed' | 'kept' | 'lost' | 'unknown';
      /** Per axis id, in each axis's declared unit. */
      position: Readonly<{ machine: Readonly<Record<string, number>>; work: Readonly<Record<string, number>> }>;
      /** The active work coordinate system; `revision` changes with every coordinate effect. */
      workOffset: Readonly<{ id: string; revision: string; origin: Readonly<Record<string, number>> }>;
      mode: 'normal' | 'tool-centre-point' | 'tilted-plane';
      /** Millimetres per minute. */
      feed: number;
      /** Limit switches pressed now, by axis id. */
      limits: readonly string[];
    }>
  | Readonly<{
      kind: 'spindle';
      mode: 'off' | 'clockwise' | 'counterclockwise';
      /** Revolutions per minute. */
      commanded: number;
      actual?: number;
      /** 0 to 1 of rated load. */
      load?: number;
    }>
  | Readonly<{ kind: 'tools'; current?: number; table: MachineTable<MachineTool> }>
  | Readonly<{ kind: 'probe'; triggered: boolean; connected: boolean; battery?: number }>
  | Readonly<{
      kind: 'material-system';
      slots: readonly MaterialSlotSnapshot[];
      /** Per nozzle; absent on a machine that stores no profiles. */
      calibrations?: MachineTable<CalibrationProfile>;
      routes: ReadonlyArray<
        // oxlint-disable-next-line typescript/no-restricted-types -- null is an empty toolhead, reported as such.
        Readonly<{ toolheadId: string; current: MaterialSlotAddress | null; target: MaterialSlotAddress | null }>
      >;
      /** Per unit: humidity index and temperature where the unit reports them. */
      units?: ReadonlyArray<Readonly<{ unitId: string; humidityIndex?: number; temperature?: Quantity }>>;
    }>
  | Readonly<{ kind: 'vendor'; type: string; schemaVersion: number; data: JsonValue }>;

/** One component's report for one observation group, with its own freshness. @public */
export type ComponentObservation = Readonly<{
  componentId: string;
  group: string;
  receivedAt: string;
  /** Host-derived from the group's declared budget. */
  validUntil?: string;
}> &
  (Readonly<{ knowledge: 'unknown'; reason: string }> | Readonly<{ knowledge: 'known'; value: MachineComponentValue }>);

/** One answer a prompt accepts. @public */
export type MachinePromptAnswer = Readonly<{
  id: string;
  label: string;
  role: 'confirm' | 'retry' | 'skip' | 'cancel' | 'other';
}>;

/** One question the machine is asking now. Asking again, even at the same step, is a new promptId. @public */
export type MachinePrompt = Readonly<{
  promptId: string;
  label: string;
  answers: readonly MachinePromptAnswer[];
  effects: readonly MachineActionEffect[];
  safety: MachineActionSafety;
}>;

/** One step of an activity. @public */
export type MachineActivityStep = Readonly<{
  id: string;
  label: string;
  actor: 'machine' | 'person';
  state: 'done' | 'active' | 'todo' | 'skipped';
}>;

/**
 * A finite procedure in progress that is not the run itself: homing, probing, a tool or filament change, a
 * calibration, drying. It may have been started at the machine; `operationId` is present only with proof.
 * @public
 */
export type MachineActivity = Readonly<{
  activityId: string;
  componentId: string;
  kind: string;
  label: string;
  /** The run that caused it, such as a tool change in the middle of a program. */
  runId?: string;
  operationId?: string;
  state: 'in-progress' | 'needs-person' | 'succeeded' | 'failed' | 'unknown';
  steps: readonly MachineActivityStep[];
  /** 0 to 1. */
  progress?: number;
  awaiting?: Readonly<{ kind: 'instruction'; label: string }> | (Readonly<{ kind: 'confirmation' }> & MachinePrompt);
  /** The action that abandons the activity, when one exists. */
  cancel?: Readonly<{ componentId: string; action: string }>;
  /** What a measuring activity found: proposals, not state. */
  results?: ReadonlyArray<
    Readonly<{ id: string; label: string; confidence: 'good' | 'uncertain' | 'failed'; value: JsonValue }>
  >;
  message?: string;
}>;

/** One fact a start depends on. @public */
export type MachineCheck = Readonly<{
  id: string;
  label: string;
  state: 'passed' | 'attention' | 'blocked' | 'unknown';
  source: 'observed' | 'computed' | 'attested';
  detail?: string;
  remedy?: MachineRemedy;
}>;

/** Whether a declared action or hold can be used now; the provider's own answer. @public */
export type MachineAvailability = Readonly<{ componentId: string; id: string }> &
  (Readonly<{ state: 'available' }> | (Readonly<{ state: 'unavailable'; remedy?: MachineRemedy }> & MachineFailure));

/** An active diagnostic with what it blocks and what clears it. @public */
export type MachineAlert = Readonly<{
  /** The code in the vendor's canonical display form. */
  code: string;
  severity?: 'fatal' | 'serious' | 'warning' | 'info';
  message?: string;
  /** The vendor's public help page: an `https:` URL. */
  reference?: string;
  blocks: 'everything' | 'motion' | 'run' | 'nothing';
  remedies?: readonly MachineRemedy[];
}>;

/** What a provider reports, before the host adds operations and freshness. @public */
export type MachineReport = Readonly<{
  /** `occupied`: another client holds a machine that serves one at a time. */
  connection: 'connected' | 'occupied' | 'disconnected' | 'unreachable';
  observedAt: string;
  state: MachineState;
  run?: MachineRun;
  components: readonly ComponentObservation[];
  activities: readonly MachineActivity[];
  /** Machine-level facts a start depends on. */
  checks: readonly MachineCheck[];
  availability: readonly MachineAvailability[];
  alerts: readonly MachineAlert[];
}>;

/** Everything the host knows about one machine: the provider's report and Tau's own recent operations. @public */
export type MachineSnapshot = MachineReport &
  Readonly<{
    /** Active and recent Tau operations; the durable record is read through `reconcileOperation`. */
    operations: readonly MachineOperation[];
  }>;

/** What a provider's `observe` yields: a whole report, or only the component groups that changed. @public */
export type MachineObservation =
  | Readonly<{ type: 'snapshot'; snapshot: MachineReport }>
  | Readonly<{ type: 'changed'; observedAt: string; components: readonly ComponentObservation[] }>;

// ───────────────────────────── Schemas ─────────────────────────────

const text = z
  .string()
  .min(1)
  .max(512)
  .refine((value) => value.isWellFormed());
const identity = z
  .string()
  .min(1)
  .max(256)
  .refine((value) => value.isWellFormed());
const instant = z.iso.datetime({ offset: true });
// Zod 4 numbers are finite by default.
const finite = z.number();
/**
 * The schema of one reported quantity, named so the report schemas' declarations can refer to it rather than
 * spelling out the units package's internal quantity type.
 * @internal
 */
// oxlint-disable-next-line typescript/consistent-type-definitions, typescript/no-empty-object-type -- An interface keeps its name in emitted declarations; an alias would not.
export interface MachineQuantitySchema extends z.ZodCustom<Quantity, Quantity> {}
const quantity: MachineQuantitySchema = z.custom<Quantity>(
  (value) =>
    typeof value === 'object' &&
    value !== null &&
    'value' in value &&
    'unit' in value &&
    'kind' in value &&
    'space' in value,
  'Expected a quantity.',
);
const json: z.ZodType<JsonValue> = z.lazy(() =>
  z.union([z.string(), z.number(), z.boolean(), z.null(), z.array(json), z.record(z.string(), json)]),
);
const byAxis = z.record(z.string().max(8), finite);
const slotAddress = z.strictObject({ unitId: identity, slotId: identity });
const preset = z.strictObject({ profileId: identity, settingId: z.string().max(128) });
const table = <Row extends z.ZodType>(row: Row) =>
  z.strictObject({ revision: identity, capacity: z.number().int().min(0).optional(), rows: z.array(row).max(512) });

const componentValueSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('switch'), on: z.boolean() }),
  z.strictObject({ kind: z.literal('level'), ratio: z.number().min(0).max(4) }),
  z.strictObject({ kind: z.literal('option'), option: identity }),
  z.strictObject({
    kind: z.literal('readings'),
    values: z
      .array(
        z.strictObject({
          id: identity,
          label: text,
          value: z.union([quantity, finite, z.string().max(512), z.boolean()]),
          target: z.union([quantity, finite]).optional(),
        }),
      )
      .max(32),
  }),
  z.strictObject({ kind: z.literal('interlock'), state: z.enum(['safe', 'unsafe', 'unknown']) }),
  z.strictObject({
    kind: z.literal('motion'),
    homed: z.record(z.string().max(8), z.boolean()),
    trust: z.enum(['homed', 'kept', 'lost', 'unknown']),
    position: z.strictObject({ machine: byAxis, work: byAxis }),
    workOffset: z.strictObject({ id: identity, revision: identity, origin: byAxis }),
    mode: z.enum(['normal', 'tool-centre-point', 'tilted-plane']),
    feed: z.number().min(0),
    limits: z.array(z.string().max(8)).max(9),
  }),
  z.strictObject({
    kind: z.literal('spindle'),
    mode: z.enum(['off', 'clockwise', 'counterclockwise']),
    commanded: z.number().min(0),
    actual: z.number().min(0).optional(),
    load: z.number().min(0).max(10).optional(),
  }),
  z.strictObject({
    kind: z.literal('tools'),
    current: z.number().int().min(0).optional(),
    table: table(
      z.strictObject({
        number: z.number().int().min(0),
        pocket: z.number().int().min(0).optional(),
        description: z.string().max(256).optional(),
        diameter: z.number().positive().optional(),
        lengthOffset: finite.optional(),
        measured: z.boolean(),
      }),
    ),
  }),
  z.strictObject({
    kind: z.literal('probe'),
    triggered: z.boolean(),
    connected: z.boolean(),
    battery: z.number().min(0).max(100).optional(),
  }),
  z.strictObject({
    kind: z.literal('material-system'),
    slots: z
      .array(
        z.strictObject({
          slot: slotAddress,
          state: z.enum(['empty', 'loaded', 'unknown']),
          identifiedBy: z.enum(['tag', 'person', 'unset', 'unknown']),
          material: z
            .strictObject({
              materialType: identity,
              color: z.string().regex(/^#[0-9A-F]{8}$/u),
              preset,
              nozzleTemperature: z.strictObject({ min: quantity, max: quantity }).optional(),
              brand: identity.optional(),
              calibration: z.discriminatedUnion('type', [
                z.strictObject({ type: z.literal('default') }),
                z.strictObject({ type: z.literal('profile'), profileId: identity }),
              ]),
            })
            .optional(),
          remainingPercent: z.number().min(0).max(100).optional(),
          editing: z.strictObject({ allowed: z.boolean(), duringRun: z.boolean(), reason: text.optional() }),
        }),
      )
      .max(64),
    calibrations: table(
      z.strictObject({
        profileId: identity,
        name: z.string().min(1).max(64),
        preset,
        nozzleId: identity,
        pressureAdvance: finite,
      }),
    ).optional(),
    routes: z
      .array(z.strictObject({ toolheadId: identity, current: slotAddress.nullable(), target: slotAddress.nullable() }))
      .max(8),
    units: z
      .array(
        z.strictObject({
          unitId: identity,
          humidityIndex: z.number().min(0).max(100).optional(),
          temperature: quantity.optional(),
        }),
      )
      .max(16)
      .optional(),
  }),
  z.strictObject({ kind: z.literal('vendor'), type: identity, schemaVersion: z.number().int().min(1), data: json }),
]);

const componentObservationSchema = z.union([
  z.strictObject({
    componentId: identity,
    group: identity,
    receivedAt: instant,
    validUntil: instant.optional(),
    knowledge: z.literal('unknown'),
    reason: text,
  }),
  z.strictObject({
    componentId: identity,
    group: identity,
    receivedAt: instant,
    validUntil: instant.optional(),
    knowledge: z.literal('known'),
    value: componentValueSchema,
  }),
]);

const failureShape = {
  code: z.enum(machineFailureCodes),
  message: text,
  issues: z
    .array(z.strictObject({ path: z.string().max(256), message: text }))
    .max(32)
    .optional(),
};

const promptSchema = z.strictObject({
  kind: z.literal('confirmation'),
  promptId: z.string().min(1).max(256),
  label: text,
  answers: z
    .array(
      z.strictObject({
        id: identity,
        label: text,
        role: z.enum(['confirm', 'retry', 'skip', 'cancel', 'other']),
      }),
    )
    .min(1)
    .max(8),
  effects: z.array(z.enum(machineActionEffects)).max(16),
  safety: machineActionSafetySchema,
});

const activitySchema = z.strictObject({
  activityId: identity,
  componentId: identity,
  kind: identity,
  label: text,
  runId: identity.optional(),
  operationId: identity.optional(),
  state: z.enum(['in-progress', 'needs-person', 'succeeded', 'failed', 'unknown']),
  steps: z
    .array(
      z.strictObject({
        id: identity,
        label: text,
        actor: z.enum(['machine', 'person']),
        state: z.enum(['done', 'active', 'todo', 'skipped']),
      }),
    )
    .max(32),
  progress: z.number().min(0).max(1).optional(),
  awaiting: z.union([z.strictObject({ kind: z.literal('instruction'), label: text }), promptSchema]).optional(),
  cancel: z.strictObject({ componentId: identity, action: identity }).optional(),
  results: z
    .array(
      z.strictObject({
        id: identity,
        label: text,
        confidence: z.enum(['good', 'uncertain', 'failed']),
        value: json,
      }),
    )
    .max(32)
    .optional(),
  message: text.optional(),
});

const checkSchema = z.strictObject({
  id: identity,
  label: text,
  state: z.enum(['passed', 'attention', 'blocked', 'unknown']),
  source: z.enum(['observed', 'computed', 'attested']),
  detail: text.optional(),
  remedy: machineRemedySchema.optional(),
});

const runSchema = z.strictObject({
  runId: identity,
  jobId: identity.optional(),
  origin: z.enum(['tau', 'external']),
  delivery: z.enum(['stored', 'streamed']),
  state: z.enum(['starting', 'running', 'paused', 'finishing', 'completed', 'cancelled', 'failed', 'unknown']),
  paused: z.strictObject({ by: z.enum(['person', 'agent', 'program', 'machine']), reason: text.optional() }).optional(),
  program: z.strictObject({ name: identity }).optional(),
  startedAt: instant.optional(),
  endedAt: instant.optional(),
  progress: z.strictObject({
    basis: z.enum(['executed', 'queued', 'estimated']),
    fraction: z.number().min(0).max(1).optional(),
    elapsed: z.number().min(0).optional(),
    remaining: z.number().min(0).optional(),
    counters: z
      .array(
        z.strictObject({
          id: identity,
          label: text,
          current: z.number().min(0),
          total: z.number().min(0).optional(),
        }),
      )
      .max(8),
  }),
  stage: text.optional(),
});

/** Strict schema of a provider report. @internal */
export const machineReportSchema = z.strictObject({
  connection: z.enum(['connected', 'occupied', 'disconnected', 'unreachable']),
  observedAt: instant,
  state: z.strictObject({ status: z.enum(machineStatuses), reason: text.optional(), native: text.optional() }),
  run: runSchema.optional(),
  components: z.array(componentObservationSchema).max(128),
  activities: z.array(activitySchema).max(16),
  checks: z.array(checkSchema).max(64),
  availability: z
    .array(
      z.union([
        z.strictObject({ componentId: identity, id: identity, state: z.literal('available') }),
        z.strictObject({
          componentId: identity,
          id: identity,
          state: z.literal('unavailable'),
          remedy: machineRemedySchema.optional(),
          ...failureShape,
        }),
      ]),
    )
    .max(256),
  alerts: z
    .array(
      z.strictObject({
        code: identity,
        severity: z.enum(['fatal', 'serious', 'warning', 'info']).optional(),
        message: text.optional(),
        reference: z
          .url({ protocol: /^https$/u, hostname: z.regexes.domain })
          .max(2048)
          .optional(),
        blocks: z.enum(['everything', 'motion', 'run', 'nothing']),
        remedies: z.array(machineRemedySchema).max(8).optional(),
      }),
    )
    .max(128),
});

/** Strict schema of one component observation. @internal */
export const componentObservationsSchema = z.array(componentObservationSchema).max(128);

/** A provider report whose components are admitted one by one ({@link admitComponentObservations}). @internal */
export const machineProviderReportSchema = machineReportSchema.extend({ components: z.array(z.unknown()).max(128) });

const componentKeySchema = z.object({ componentId: identity, group: identity });

/**
 * Admit a provider's component observations one by one: an element the strict schema refuses (a newer value kind,
 * an over-limit table, an unknown key) becomes `unknown` for that component and group, so one unreadable value
 * never costs the rest of the report. An element without a readable component and group is dropped.
 * @internal
 * @param candidates - The provider's elements, already bounded in count.
 * @param receivedAt - When the report holding them was observed.
 * @returns The admitted observations, and each refused element's key with why it was refused.
 */
export const admitComponentObservations = (
  candidates: readonly unknown[],
  receivedAt: string,
): Readonly<{
  components: readonly ComponentObservation[];
  refused: ReadonlyArray<Readonly<{ componentId?: string; group?: string; error: z.ZodError }>>;
}> => {
  const components: ComponentObservation[] = [];
  const refused: Array<Readonly<{ componentId?: string; group?: string; error: z.ZodError }>> = [];
  for (const candidate of candidates) {
    const parsed = componentObservationSchema.safeParse(candidate);
    if (parsed.success) {
      components.push(parsed.data);
      continue;
    }
    const key = componentKeySchema.safeParse(candidate);
    refused.push({ ...(key.success ? key.data : {}), error: parsed.error });
    if (key.success) {
      components.push({ ...key.data, receivedAt, knowledge: 'unknown', reason: 'Unreadable report' });
    }
  }
  return { components, refused };
};

/** Strict schema of one machine check. @internal */
export const machineCheckSchema = checkSchema;

/**
 * The known value of one component's group, when it was observed.
 * @param components - A report's component observations.
 * @param componentId - The component.
 * @param kind - The value kind expected.
 * @returns The value, or undefined when unknown or absent.
 * @public
 */
export const componentValue = <Kind extends MachineComponentValue['kind']>(
  components: readonly ComponentObservation[],
  componentId: string,
  kind: Kind,
): Extract<MachineComponentValue, { kind: Kind }> | undefined => {
  for (const observation of components) {
    if (
      observation.componentId === componentId &&
      observation.knowledge === 'known' &&
      observation.value.kind === kind
    ) {
      return observation.value as Extract<MachineComponentValue, { kind: Kind }>;
    }
  }
  return undefined;
};

/**
 * Merge changed component groups into a report: a changed group replaces the same component's group.
 * @param components - The current observations.
 * @param changed - Newer observations.
 * @returns The merged observations.
 * @public
 */
export const mergeComponentObservations = (
  components: readonly ComponentObservation[],
  changed: readonly ComponentObservation[],
): readonly ComponentObservation[] => {
  const key = (observation: ComponentObservation): string => `${observation.componentId}\u0000${observation.group}`;
  const merged = new Map(components.map((observation) => [key(observation), observation]));
  for (const observation of changed) {
    merged.set(key(observation), observation);
  }
  return [...merged.values()];
};
