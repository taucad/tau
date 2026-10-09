/**
 * Machine manifest, version 3: what one machine model is made of and what it can be asked to do.
 *
 * The manifest is plain frozen data shared by every kind of machine. Axes and components describe the hardware;
 * processes carry what is specific to a way of making things (the FFF process carries the printer scene and slicing
 * defaults); actions and holds are the declared controls; `jobs` says how programs reach the machine and start;
 * `stop` says what halting does. After connecting, the session reports what is actually installed in the same shape
 * (`MachineDescriptor.capabilities`).
 *
 * @module
 */

import { z } from 'zod';
import { admitConfigurationManifest } from '#configuration/configuration.js';
import type { ConfigurationManifestV1 } from '#configuration/index.js';
import { machineActionEffects, machineStatuses } from '#machines/machine-actions.js';
import type {
  MachineActionDescriptor,
  MachineActionSafety,
  MachineHaltOutcome,
  MachineHoldDescriptor,
  MachineQualificationProfile,
  MachineRemedy,
} from '#machines/machine-actions.js';
import { machineTypeIdSchema } from '#machines/settings.js';

const label = z.string().min(1).max(128);
const identifier = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[a-z0-9][a-z0-9._-]*$/u);
/** A vendor-owned name: `makera.wireless-probe`. */
const namespaced = z
  .string()
  .min(3)
  .max(64)
  .regex(/^[a-z0-9-]+\.[a-z0-9.-]+$/u);
const sentence = z.string().min(1).max(512);
const millimetres = z.number().positive().max(10_000);

/** One declared physical quantity with its native unit. @public */
export const machineManifestQuantitySchema = z.strictObject({
  value: z.number(),
  unit: z.string().min(1).max(32),
});

/** Axis-aligned size in millimetres. @public */
export const machineManifestSizeSchema = z.strictObject({ x: millimetres, y: millimetres, z: millimetres });

const configurationManifestSchema = z.custom<ConfigurationManifestV1>((value) => {
  try {
    admitConfigurationManifest(value);
    return true;
  } catch {
    return false;
  }
}, 'Invalid configuration manifest.');

const remedySchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('action'), componentId: identifier, action: z.string().min(1).max(128) }),
  z.strictObject({ type: z.literal('person'), instruction: sentence }),
]);

const haltOutcomeSchema = z.strictObject({
  motion: z.enum(['halts', 'decelerates', 'finishes-queued']),
  spindle: z.enum(['stops', 'keeps-turning', 'none']),
  heaters: z.enum(['off', 'unchanged', 'none']),
  position: z.enum(['kept', 'may-be-lost']),
  recovery: z.array(remedySchema).max(8),
});

const safetySchema = z.strictObject({
  authority: z.enum(['agent', 'approved-agent', 'person']),
  attended: z.boolean(),
  interlocks: z.array(identifier).max(8),
  maximumDuration: z.number().int().positive().max(86_400_000).optional(),
});

const actionId = z.union([identifier, namespaced]);

const actionDescriptorShape = {
  componentId: identifier,
  id: actionId,
  version: z.number().int().min(1).max(1000),
  label,
  description: sentence.optional(),
  configuration: configurationManifestSchema,
  effects: z.array(z.enum(machineActionEffects)).max(16),
  when: z.array(z.enum(machineStatuses)).min(1).max(6),
  safety: safetySchema,
  qualification: z.discriminatedUnion('status', [
    z.strictObject({ status: z.enum(['designed', 'unsupported']), reason: sentence }),
    z.strictObject({ status: z.literal('qualified'), profileId: identifier }),
  ]),
  requires: z.array(z.strictObject({ componentId: identifier, group: identifier })).max(16),
  consequence: sentence.optional(),
  outcome: haltOutcomeSchema.optional(),
  confirms: z.enum(['observation', 'acknowledgement', 'none']),
};

/** One declared action, as a manifest carries it. @public */
export const machineActionDescriptorSchema = z.strictObject({
  ...actionDescriptorShape,
  scope: z.enum(['idle', 'run', 'any']),
});

/**
 * One declared hold, as a manifest carries it. Admissible only while `ready`: a hold during a run would cancel it.
 * @public
 */
export const machineHoldDescriptorSchema = z.strictObject({
  ...actionDescriptorShape,
  when: z.array(z.literal('ready')).length(1),
  lease: z.number().int().min(20).max(2000),
  bound: z.number().int().min(20).max(5000),
});

const axisSchema = z.strictObject({
  /** The controller's axis letter in lower case: `x`, `y`, `z`, `a`, `b`, `c`. */
  id: z.string().regex(/^[a-z]$/u),
  label,
  kind: z.enum(['linear', 'rotary']),
  /** Millimetres for a linear axis, degrees for a rotary axis. */
  unit: z.enum(['mm', 'deg']),
  travel: z.strictObject({ min: z.number(), max: z.number() }).optional(),
  carries: z.enum(['tool', 'work']),
  ridesOn: z
    .string()
    .regex(/^[a-z]$/u)
    .optional(),
  reference: z.enum(['cycle', 'absolute', 'none']),
  rotary: z
    .strictObject({
      behaviour: z.enum(['limited', 'continuous', 'modulo', 'indexed']),
      positive: z.enum(['clockwise', 'counterclockwise']),
    })
    .optional(),
});

const componentBase = { id: identifier, label, parentId: identifier.optional() };
const simpleKinds = [
  'controller',
  'light',
  'fan',
  'heater',
  'coolant',
  'air',
  'vacuum',
  'extraction',
  'override',
  'speed-profile',
  'camera',
  'storage',
  'enclosure',
  'laser',
] as const;
const nozzleSchema = z.strictObject({
  id: identifier,
  diameter: machineManifestQuantitySchema,
  maximumTemperature: machineManifestQuantitySchema,
  material: z.enum(['stainless', 'hardened']),
});

const componentSchema = z.union([
  z.strictObject({ ...componentBase, kind: z.enum(simpleKinds) }),
  z.strictObject({ ...componentBase, kind: z.literal('motion'), axes: z.array(z.string()).min(1).max(9) }),
  z.strictObject({
    ...componentBase,
    kind: z.literal('spindle'),
    control: z.enum(['programmed', 'switched', 'manual']),
    /** Revolutions per minute. */
    speed: z.strictObject({ min: z.number().nonnegative(), max: z.number().positive() }).optional(),
    directions: z.array(z.enum(['clockwise', 'counterclockwise'])).max(2),
  }),
  z.strictObject({
    ...componentBase,
    kind: z.literal('tools'),
    change: z.enum(['manual', 'automatic']),
    pockets: z.number().int().min(0).max(256),
    measures: z.enum(['never', 'on-request', 'on-change']),
    lengthReference: z.enum(['reference-tool', 'gauge-line', 'spindle-nose', 'none']),
  }),
  z.strictObject({ ...componentBase, kind: z.literal('probe'), finds: z.enum(['work', 'tool-length']) }),
  z.strictObject({ ...componentBase, kind: z.literal('toolhead'), nozzles: z.array(nozzleSchema).min(1).max(8) }),
  z.strictObject({
    ...componentBase,
    kind: z.literal('material-system'),
    units: z
      .array(
        z.strictObject({
          id: identifier,
          label,
          kind: z.enum(['feeder', 'external']),
          slots: z
            .array(z.strictObject({ id: identifier, label }))
            .min(1)
            .max(16),
        }),
      )
      .max(16),
    routes: z.array(z.strictObject({ unitId: identifier, toolheadIds: z.array(identifier).min(1).max(8) })).max(16),
  }),
  z.strictObject({
    ...componentBase,
    kind: z.literal('interlock'),
    guards: z.enum(['door', 'emergency-stop', 'limit', 'other']),
  }),
  /**
   * A part Tau does not know: it renders generically and takes the most restrictive safety floor. The vendor shape is
   * `{ kind: 'vendor', type: '<vendor>.<name>' }` rather than a namespaced `kind`, so `kind` stays a closed
   * discriminant; the same holds for a vendor component value.
   */
  z.strictObject({ ...componentBase, kind: z.literal('vendor'), type: namespaced }),
]);

const fffProcessSchema = z.strictObject({
  type: z.literal('fff'),
  version: z.literal(1),
  geometry: z.strictObject({
    unit: z.literal('mm'),
    buildVolume: machineManifestSizeSchema,
    enclosure: z.strictObject({
      outer: machineManifestSizeSchema,
      enclosed: z.boolean(),
      doors: z
        .array(z.enum(['front', 'top', 'side']))
        .max(4)
        .default([]),
    }),
    kinematics: z.enum(['corexy', 'cartesian-bedslinger', 'cartesian-gantry', 'delta']),
    bedMotion: z.enum(['z', 'y', 'none']),
    origin: z.enum(['front-left', 'center']),
    toolheadHome: machineManifestSizeSchema,
    materialSystemMount: z.enum(['top', 'side', 'external', 'none']).default('none'),
  }),
  filamentDiameter: machineManifestQuantitySchema,
  bed: z.strictObject({
    maximumTemperature: machineManifestQuantitySchema,
    plates: z
      .array(z.strictObject({ id: identifier, label }))
      .min(1)
      .max(16),
  }),
  chamber: z.strictObject({
    enclosed: z.boolean(),
    heated: z.boolean(),
    maximumTemperature: machineManifestQuantitySchema.optional(),
  }),
  speedProfiles: z.array(z.strictObject({ id: identifier, label, percent: z.number().int().min(1).max(400) })).max(8),
  slicing: z.strictObject({
    recommended: z.strictObject({
      layerHeight: machineManifestQuantitySchema,
      walls: z.number().int().min(1).max(16),
      infillPercent: z.number().int().min(0).max(100),
      nozzleTemperature: machineManifestQuantitySchema,
      bedTemperature: machineManifestQuantitySchema,
    }),
    presets: z
      .array(
        z.strictObject({ id: z.enum(['fast', 'standard', 'fine']), label, layerHeight: machineManifestQuantitySchema }),
      )
      .length(3),
  }),
});

const millingProcessSchema = z.strictObject({
  type: z.literal('milling'),
  version: z.literal(1),
  /** Axes the controller interpolates together. */
  simultaneousAxes: z.number().int().min(1).max(9),
  features: z
    .array(z.enum(['tool-centre-point', 'tilted-plane', 'cutter-compensation', 'canned-cycles', 'arcs']))
    .max(8),
  /** Work coordinate systems the controller stores, in its own words: `G54` … `G59`. */
  workOffsets: z.array(z.string().min(1).max(16)).min(1).max(32),
  kinematics: z.strictObject({ id: identifier, calibrationRevision: z.string().min(1).max(128) }).optional(),
  /** The machine's working area, for the scene. Millimetres. */
  workArea: machineManifestSizeSchema.optional(),
});

const processSchema = z.union([
  fffProcessSchema,
  millingProcessSchema,
  z.strictObject({ type: namespaced, version: z.number().int().min(1) }),
]);

/**
 * The observation groups every consumer reads by id. `state`: the controller's state readings; `position`: motion;
 * `temperature`: heaters and chambers; `material`: the material system; `tools`: the tool table; `environment`:
 * ambient and enclosure readings; `load`: spindle and axis loads; `accessories`: switches, levels and options;
 * `inputs`: sensors and interlocks. A vendor's own group is namespaced `<vendor>.<name>` and is rendered by its
 * label.
 * @public
 */
export const machineObservationGroups = [
  'state',
  'position',
  'temperature',
  'material',
  'tools',
  'environment',
  'load',
  'accessories',
  'inputs',
] as const;

/** One standard observation group id. @public */
export type MachineObservationGroup = (typeof machineObservationGroups)[number];

const observationGroupSchema = z.union([z.enum(machineObservationGroups), namespaced]);

const acceptedContainerSchema = z.strictObject({
  contract: z.strictObject({ id: z.string().min(1).max(256), version: z.number().int().min(1) }),
  mediaType: z.string().min(1).max(256),
  requiredMembers: z.array(z.string().min(1).max(512)).max(128).readonly(),
  payloadSelection: z.enum(['plate', 'single']),
  technology: z.string().min(1).max(256),
});

const jobsSchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('unsupported') }),
  z.strictObject({
    type: z.literal('supported'),
    accepts: z.array(acceptedContainerSchema).min(1).max(32).readonly(),
    /** `streamed`: the host feeds the program for the whole run and must stay connected. */
    delivery: z.enum(['stored', 'streamed']),
    /** `at-machine`: a person presses the machine's own start after Tau has loaded the program. */
    start: z.enum(['remote', 'at-machine']),
    submission: configurationManifestSchema,
    /** What a person vouches for before a start; recorded with the job. */
    attestations: z.array(z.strictObject({ id: identifier, label: sentence })).max(16),
    safety: safetySchema,
  }),
]);

/** Complete machine manifest, version 3. @public */
export const machineManifestSchema = z.strictObject({
  version: z.literal(3),
  identity: z.strictObject({
    typeId: machineTypeIdSchema,
    vendor: label,
    model: identifier,
    displayName: label,
    family: label.optional(),
  }),
  connection: z.strictObject({
    transport: z.enum(['network', 'serial']),
    /** One host at a time. */
    exclusive: z.boolean(),
    /** Many serial controllers restart when their port opens. */
    opening: z.enum(['nothing', 'resets-controller']),
    identity: z.enum(['authenticated', 'claimed']),
    /**
     * TLS services a binding pins on first use, each under the `serviceTrust` name the provider reads (`mqtt`,
     * `camera`); a `required` one that does not answer refuses the binding. Absent: nothing is pinned.
     */
    services: z
      .array(z.strictObject({ id: identifier, port: z.number().int().min(1).max(65_535), required: z.boolean() }))
      .max(8)
      .optional(),
  }),
  axes: z.array(axisSchema).max(9),
  components: z.array(componentSchema).min(1).max(64),
  processes: z.array(processSchema).max(4),
  actions: z.array(machineActionDescriptorSchema).max(96),
  holds: z.array(machineHoldDescriptorSchema).max(8),
  jobs: jobsSchema,
  stop: haltOutcomeSchema,
  observations: z
    .array(
      z.strictObject({
        group: observationGroupSchema,
        label,
        /** Milliseconds after which an observation of this group is presented as stale. */
        staleAfter: z.number().int().positive().max(3_600_000),
        /** `latest` groups are coalesced and never replayed to a watcher that resumes. */
        delivery: z.enum(['retained', 'latest']),
      }),
    )
    .max(32),
  qualifications: z
    .array(
      z.strictObject({
        id: identifier,
        environment: z.enum(['hardware', 'simulation']),
        model: label,
        firmware: z.array(z.string().max(64)).max(32),
        attachments: z.array(identifier).max(32),
        evidence: sentence,
      }),
    )
    .max(32),
});

/** One installed part of a machine. @public */
export type MachineComponent = z.infer<typeof componentSchema>;
/** One axis the controller reports and moves. @public */
export type MachineAxis = z.infer<typeof axisSchema>;
/** A way this machine makes things. @public */
export type MachineProcess = z.infer<typeof processSchema>;
/** The FFF process facts. @public */
export type MachineFffProcess = z.infer<typeof fffProcessSchema>;
/** The milling process facts. @public */
export type MachineMillingProcess = z.infer<typeof millingProcessSchema>;
/** How programs reach the machine and start. @public */
export type MachineJobFacts = z.infer<typeof jobsSchema>;
/** How a host reaches the machine and what reaching it does. @public */
export type MachineConnectionFacts = z.infer<typeof machineManifestSchema>['connection'];

/** Frozen machine model description carried by every provider. @public */
export type MachineManifest = Omit<
  z.infer<typeof machineManifestSchema>,
  'actions' | 'holds' | 'stop' | 'qualifications'
> &
  Readonly<{
    actions: readonly MachineActionDescriptor[];
    holds: readonly MachineHoldDescriptor[];
    stop: MachineHaltOutcome;
    qualifications: readonly MachineQualificationProfile[];
  }>;

/** The FFF process of a manifest, when it has one. @public */
export const fffProcessOf = (manifest: Pick<MachineManifest, 'processes'>): MachineFffProcess | undefined =>
  manifest.processes.find((process): process is MachineFffProcess => process.type === 'fff');

/** The milling process of a manifest, when it has one. @public */
export const millingProcessOf = (manifest: Pick<MachineManifest, 'processes'>): MachineMillingProcess | undefined =>
  manifest.processes.find((process): process is MachineMillingProcess => process.type === 'milling');

/**
 * Whether a provider drives a simulated machine: every qualification it declares is in the `simulation` environment.
 * The one way to tell; never a provider-id test.
 * @param manifest - The provider's manifest.
 * @returns True for a simulator.
 * @public
 */
export const isSimulatedMachine = (manifest: Pick<MachineManifest, 'qualifications'>): boolean =>
  manifest.qualifications.length > 0 &&
  manifest.qualifications.every((qualification) => qualification.environment === 'simulation');

/** Remedy and outcome shapes, for consumers that parse them. @internal */
export const machineRemedySchema: z.ZodType<MachineRemedy> = remedySchema;
/** @internal */
export const machineHaltOutcomeSchema: z.ZodType<MachineHaltOutcome> = haltOutcomeSchema;
/** @internal */
export const machineActionSafetySchema: z.ZodType<MachineActionSafety> = safetySchema;

const assertReferences = (manifest: z.infer<typeof machineManifestSchema>): void => {
  const components = new Map(manifest.components.map((component) => [component.id, component]));
  if (components.size !== manifest.components.length) {
    throw new TypeError('parseMachineManifest: component ids must be unique.');
  }
  const services = manifest.connection.services ?? [];
  if (new Set(services.map(({ id }) => id)).size !== services.length) {
    throw new TypeError('parseMachineManifest: service ids must be unique.');
  }
  const axes = new Set(manifest.axes.map((axis) => axis.id));
  if (axes.size !== manifest.axes.length) {
    throw new TypeError('parseMachineManifest: axis ids must be unique.');
  }
  const actions = new Set<string>();
  for (const action of [...manifest.actions, ...manifest.holds]) {
    const key = `${action.componentId}:${action.id}:${'scope' in action ? 'action' : 'hold'}`;
    if (actions.has(key)) {
      throw new TypeError(`parseMachineManifest: ${action.id} is declared twice on ${action.componentId}.`);
    }
    actions.add(key);
    if (!components.has(action.componentId)) {
      throw new TypeError(`parseMachineManifest: ${action.id} targets unknown component ${action.componentId}.`);
    }
    for (const interlock of action.safety.interlocks) {
      if (components.get(interlock)?.kind !== 'interlock') {
        throw new TypeError(`parseMachineManifest: ${interlock} is not an interlock component.`);
      }
    }
  }
  for (const component of manifest.components) {
    if (component.kind === 'motion' && component.axes.some((axis) => !axes.has(axis))) {
      throw new TypeError(`parseMachineManifest: ${component.id} moves an undeclared axis.`);
    }
  }
};

/**
 * Admit one manifest, refusing unknown keys, out-of-range values and dangling references.
 *
 * @param candidate - Plain data claiming to be a manifest.
 * @returns The frozen manifest.
 * @throws ZodError or TypeError when the candidate is not a manifest.
 * @public
 */
export const parseMachineManifest = (candidate: unknown): MachineManifest => {
  const manifest = machineManifestSchema.parse(candidate);
  assertReferences(manifest);
  return Object.freeze(manifest) as MachineManifest;
};
