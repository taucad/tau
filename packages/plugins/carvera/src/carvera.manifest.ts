import { defineConfiguration } from '@taucad/runtime/configuration';
import { quantity } from '@taucad/runtime/configuration/zod';
import { defineMachineAction, machineJogHold, standardMachineAction } from '@taucad/runtime/machine';
import type {
  MachineActionDefinition,
  MachineActionQualification,
  MachineHoldDefinition,
  MachineManifestDefinition,
  MachineQualificationProfile,
} from '@taucad/runtime/machine';
import { z } from 'zod';

const idle = ['ready'] as const;
const running = ['active', 'held'] as const;

/** The work coordinate systems the controller stores; only G54 survives a power cycle. @internal */
export const carveraWorkOffsets = ['G54', 'G55', 'G56', 'G57', 'G58', 'G59'] as const;

/** Rack pockets T1–T6; T0 is the wireless probe in its own pocket. @internal */
export const carveraRackTools = 6;

/**
 * The start form. Carvera's "Config and Run" options become one `M495` line the machine runs before the program's
 * first line; the region comes from the program's own extents.
 * @internal
 */
export const carveraSubmissionConfiguration = defineConfiguration({
  id: 'makera.carvera.job',
  version: '1',
  schema: z.strictObject({
    workOffset: z.enum(carveraWorkOffsets).default('G54').meta({ title: 'Work offset' }),
    scanMargin: z.boolean().default(true).meta({
      title: 'Trace the outline first',
      description: 'The probe laser traces the job outline for a person to watch.',
    }),
    probeZ: z.boolean().default(true).meta({ title: 'Probe the stock top' }),
    level: z
      .discriminatedUnion('enabled', [
        z.strictObject({ enabled: z.literal(false) }),
        z.strictObject({
          enabled: z.literal(true),
          columns: z.number().int().min(2).max(10).meta({ title: 'Columns' }),
          rows: z.number().int().min(2).max(10).meta({ title: 'Rows' }),
          lift: z.number().min(0.5).max(10).meta({ title: 'Lift between points', description: 'Millimetres.' }),
        }),
      ])
      .default({ enabled: false })
      .meta({ title: 'Level the surface' }),
  }),
  ui: { version: 1, rjsf: {} },
});

/** The submission a provider receives. @internal */
export type CarveraSubmission = z.output<typeof carveraSubmissionConfiguration.schema>;

/** Parameters of `work-offset.select`. @internal */
export const carveraWorkOffsetSelectSchema = z.strictObject({
  offset: z.enum(carveraWorkOffsets).meta({ title: 'Work offset' }),
});
/** Parameters of `work-offset.set`. @internal */
export const carveraWorkOffsetSetSchema = z.strictObject({
  offset: z.enum(carveraWorkOffsets).meta({ title: 'Work offset' }),
  // Partial: setting only Z is the common case.
  position: z.partialRecord(z.enum(['x', 'y', 'z']), z.number()).meta({
    title: 'Position here',
    description: 'The work coordinates the tool has now. Millimetres.',
  }),
});
/** Parameters of `probe.run`. @internal */
export const carveraProbeSchema = z.strictObject({
  cycle: z.enum(['z-surface', 'corner', 'bore-centre']).meta({ title: 'Cycle' }),
});
/** Parameters of `tool.change`. @internal */
export const carveraToolSchema = z.strictObject({
  tool: z.number().int().min(0).max(carveraRackTools).meta({ title: 'Tool', description: 'T0 is the probe.' }),
});
/** Parameters of `spindle.set`. @internal */
export const carveraSpindleSchema = z.discriminatedUnion('mode', [
  z.strictObject({ mode: z.literal('off') }),
  z.strictObject({
    mode: z.literal('clockwise'),
    speed: quantity({ unit: '/min', symbol: 'rpm' }).min(1000).max(15_000).meta({ title: 'Speed' }),
    duration: quantity({ unit: 's' }).positive().max(300).meta({ title: 'Stops by itself after' }),
  }),
]);
/** Parameters of the feed override. @internal */
export const carveraFeedOverrideSchema = z.strictObject({
  ratio: quantity({ unit: '1' }).min(0.1).max(4).meta({ title: 'Level', description: '1 is the programmed feed.' }),
});
/** Parameters of the spindle override. @internal */
export const carveraSpindleOverrideSchema = z.strictObject({
  ratio: quantity({ unit: '1' }).min(0.5).max(2).meta({ title: 'Level', description: '1 is the programmed speed.' }),
});

const state = (componentId: string) => [{ componentId, group: 'state' }] as const;
const position = [{ componentId: 'motion', group: 'position' }] as const;
const inputs = [{ componentId: 'cover', group: 'inputs' }] as const;

/**
 * Every declared action. Nothing is qualified on hardware; a simulator passes its own profile.
 * @param qualification - What each action is qualified under; absent leaves each `designed`.
 * @returns The definitions.
 */
const actions = (qualification?: MachineActionQualification): readonly MachineActionDefinition[] => {
  const qualified = qualification === undefined ? {} : { qualification };
  return [
    standardMachineAction({
      id: 'run.pause',
      componentId: 'controller',
      label: 'Pause',
      when: ['active'],
      requires: state('controller'),
      // The spindle keeps turning in the cut, so an agent pausing needs a person's approval.
      safety: { authority: 'approved-agent' },
      consequence: 'Queued moves finish first. The spindle keeps turning until you stop it.',
      outcome: {
        motion: 'finishes-queued',
        spindle: 'keeps-turning',
        heaters: 'none',
        position: 'kept',
        recovery: [{ type: 'action', componentId: 'controller', action: 'run.resume' }],
      },
      ...qualified,
    }),
    standardMachineAction({
      id: 'run.resume',
      componentId: 'controller',
      label: 'Resume',
      when: ['held'],
      requires: [...state('controller'), ...inputs],
      safety: { authority: 'person', attended: true, interlocks: ['cover'] },
      consequence: 'The tool returns in a straight line to where it paused. Anything moved into that path is hit.',
      ...qualified,
    }),
    standardMachineAction({
      id: 'run.cancel',
      componentId: 'controller',
      label: 'Stop job',
      when: running,
      requires: state('controller'),
      consequence: 'Moves already queued still run before the spindle stops. Use Stop to halt at once.',
      outcome: { motion: 'finishes-queued', spindle: 'stops', heaters: 'none', position: 'kept', recovery: [] },
      ...qualified,
    }),
    standardMachineAction({
      id: 'controller.unlock',
      componentId: 'controller',
      label: 'Unlock',
      when: ['alarm'],
      consequence: 'Home afterwards: the position may be wrong.',
      ...qualified,
    }),
    standardMachineAction({
      id: 'controller.wake',
      componentId: 'controller',
      label: 'Wake',
      when: ['asleep'],
      consequence: 'The machine restarts and homes by itself.',
      ...qualified,
    }),
    standardMachineAction({
      id: 'motion.home',
      componentId: 'motion',
      label: 'Home',
      when: ['ready', 'alarm'],
      requires: inputs,
      safety: { interlocks: ['cover'] },
      ...qualified,
    }),
    standardMachineAction({
      id: 'motion.jog',
      componentId: 'motion',
      label: 'Jog',
      when: idle,
      requires: position,
      ...qualified,
    }),
    standardMachineAction({
      id: 'motion.move',
      componentId: 'motion',
      label: 'Go to',
      when: idle,
      requires: position,
      ...qualified,
    }),
    standardMachineAction({
      id: 'work-offset.select',
      componentId: 'motion',
      label: 'Use work offset',
      when: idle,
      schema: carveraWorkOffsetSelectSchema,
      ...qualified,
    }),
    standardMachineAction({
      id: 'work-offset.set',
      componentId: 'motion',
      label: 'Set work origin',
      when: idle,
      requires: position,
      consequence: 'Setting Z also re-bases the tool lengths on this machine.',
      schema: carveraWorkOffsetSetSchema,
      ...qualified,
    }),
    standardMachineAction({
      id: 'probe.run',
      componentId: 'probe',
      label: 'Probe',
      when: idle,
      requires: [...position, ...inputs],
      safety: { interlocks: ['cover'] },
      consequence: 'The spindle swaps its tool for the probe, probes and puts the tool back.',
      schema: carveraProbeSchema,
      ...qualified,
    }),
    standardMachineAction({
      id: 'tool.change',
      componentId: 'tools',
      label: 'Change tool',
      when: idle,
      requires: [...position, ...inputs],
      safety: { interlocks: ['cover'] },
      consequence: 'The spindle drops its tool in its pocket, picks the new one and measures it.',
      schema: carveraToolSchema,
      ...qualified,
    }),
    standardMachineAction({
      id: 'tool.measure',
      componentId: 'tool-setter',
      label: 'Measure tool',
      when: idle,
      requires: [...position, ...inputs],
      safety: { interlocks: ['cover'] },
      ...qualified,
    }),
    standardMachineAction({
      id: 'spindle.set',
      componentId: 'spindle',
      label: 'Spindle',
      when: idle,
      requires: inputs,
      safety: { interlocks: ['cover'], maximumDuration: 300_000 },
      consequence:
        'The spindle runs for the time you set, then stops by itself. Only Stop ends it sooner, and the Carvera then needs homing.',
      schema: carveraSpindleSchema,
      ...qualified,
    }),
    standardMachineAction({
      id: 'switch.set',
      componentId: 'light',
      componentKind: 'light',
      label: 'Light',
      when: ['ready', 'active', 'held'],
      effects: ['illumination'],
      ...qualified,
    }),
    standardMachineAction({
      id: 'switch.set',
      componentId: 'vacuum',
      label: 'Vacuum',
      when: ['ready', 'active', 'held'],
      effects: ['fluid'],
      ...qualified,
    }),
    standardMachineAction({
      id: 'switch.set',
      componentId: 'air',
      label: 'Air blast',
      when: ['ready', 'active', 'held'],
      effects: ['fluid'],
      ...qualified,
    }),
    standardMachineAction({
      id: 'level.set',
      componentId: 'feed-override',
      label: 'Feed override',
      when: running,
      effects: ['motion'],
      schema: carveraFeedOverrideSchema,
      ...qualified,
    }),
    standardMachineAction({
      id: 'level.set',
      componentId: 'spindle-override',
      label: 'Spindle override',
      when: running,
      effects: ['spindle'],
      schema: carveraSpindleOverrideSchema,
      ...qualified,
    }),
    standardMachineAction({
      id: 'interaction.respond',
      componentId: 'controller',
      label: 'Answer',
      when: ['held', 'active'],
      effects: ['motion'],
      safety: { attended: true },
      ...qualified,
    }),
    defineMachineAction(
      {
        componentId: 'motion',
        id: 'makera.levelling.clear',
        version: 1,
        label: 'Clear levelling map',
        description: 'Stop compensating moves with the surface map measured before a job.',
        effects: ['coordinates'],
        scope: 'idle',
        when: idle,
        safety: { authority: 'person', attended: false, interlocks: [] },
        requires: state('controller'),
        confirms: 'observation',
        ...qualified,
      },
      z.strictObject({}),
    ),
    defineMachineAction(
      {
        componentId: 'probe',
        id: 'makera.probe.pair',
        version: 1,
        label: 'Pair probe',
        description: 'Pair the wireless probe with this machine.',
        effects: ['configuration'],
        scope: 'idle',
        when: idle,
        safety: { authority: 'person', attended: true, interlocks: [] },
        requires: [],
        consequence: 'Hold the probe near the spindle while it pairs.',
        confirms: 'acknowledgement',
        ...qualified,
      },
      z.strictObject({}),
    ),
  ];
};

/**
 * The held jog. Stock firmware has no jog cancel, so a hold sends one short relative jog at a time and only once the
 * machine's own position report shows the previous one at least half done: what is queued at the machine never
 * exceeds `bound` of motion, whatever the network delays.
 * @param qualification - What the hold is qualified under; absent leaves it `designed`.
 * @returns The one held jog.
 */
const holds = (qualification?: MachineActionQualification): readonly MachineHoldDefinition[] => [
  machineJogHold({
    componentId: 'motion',
    lease: 100,
    bound: 300,
    ...(qualification === undefined ? {} : { qualification }),
  }),
];

/** Proof gathered against the in-memory controller that speaks the real framing. @internal */
export const carveraSimulationProfile: MachineQualificationProfile = {
  id: 'carvera-simulation',
  environment: 'simulation',
  model: 'Carvera C1',
  firmware: ['1.0.7'],
  attachments: [],
  evidence: 'packages/plugins/carvera/src/carvera.simulator.test.ts against the simulated controller.',
};

/**
 * The Carvera C1 manifest.
 * @internal
 * @param profile - A qualification profile every action is qualified under; absent leaves each `designed`.
 * @returns The authored manifest.
 */
export const carveraManifest = (profile?: MachineQualificationProfile): MachineManifestDefinition => {
  const qualification: MachineActionQualification | undefined =
    profile === undefined ? undefined : { status: 'qualified', profileId: profile.id };
  return {
    version: 3,
    identity: {
      typeId: 'makera.carvera-c1',
      vendor: 'Makera',
      model: 'carvera-c1',
      displayName: profile === undefined ? 'Carvera' : 'Simulated Carvera',
      family: 'Carvera',
    },
    // One TCP client at a time, dropped after 10 s of silence; the broadcast name is a claim, so a binding is pinned
    // to the address.
    connection: { transport: 'network', exclusive: true, opening: 'nothing', identity: 'claimed' },
    // Travel is the C1's soft limits (minimum only; the machine's origin is its upper right).
    axes: [
      {
        id: 'x',
        label: 'X',
        kind: 'linear',
        unit: 'mm',
        travel: { min: -371, max: 0 },
        carries: 'tool',
        reference: 'cycle',
      },
      {
        id: 'y',
        label: 'Y',
        kind: 'linear',
        unit: 'mm',
        travel: { min: -250, max: 0 },
        carries: 'work',
        reference: 'cycle',
      },
      {
        id: 'z',
        label: 'Z',
        kind: 'linear',
        unit: 'mm',
        travel: { min: -135, max: 0 },
        carries: 'tool',
        ridesOn: 'x',
        reference: 'cycle',
      },
    ],
    components: [
      { id: 'controller', kind: 'controller', label: 'Carvera' },
      { id: 'motion', kind: 'motion', label: 'Axes', axes: ['x', 'y', 'z'] },
      {
        id: 'spindle',
        kind: 'spindle',
        label: 'Spindle',
        control: 'programmed',
        speed: { min: 0, max: 15_000 },
        directions: ['clockwise'],
      },
      // The rack's contents are not sensed: which cutter sits in which pocket is a person's statement.
      {
        id: 'tools',
        kind: 'tools',
        label: 'Tool changer',
        change: 'automatic',
        pockets: carveraRackTools,
        measures: 'on-change',
        lengthReference: 'reference-tool',
      },
      { id: 'probe', kind: 'probe', label: 'Wireless probe', finds: 'work' },
      { id: 'tool-setter', kind: 'probe', label: 'Tool setter', finds: 'tool-length' },
      { id: 'cover', kind: 'interlock', label: 'Enclosure cover', guards: 'door' },
      { id: 'estop', kind: 'interlock', label: 'Emergency stop', guards: 'emergency-stop' },
      { id: 'light', kind: 'light', label: 'Light' },
      { id: 'vacuum', kind: 'vacuum', label: 'Vacuum' },
      { id: 'air', kind: 'air', label: 'Air blast' },
      { id: 'feed-override', kind: 'override', label: 'Feed' },
      { id: 'spindle-override', kind: 'override', label: 'Spindle speed', parentId: 'spindle' },
    ],
    processes: [
      {
        type: 'milling',
        version: 1,
        simultaneousAxes: 3,
        features: ['arcs'],
        workOffsets: [...carveraWorkOffsets],
        workArea: { x: 340, y: 240, z: 140 },
      },
    ],
    actions: actions(qualification),
    holds: holds(qualification),
    jobs: {
      type: 'supported',
      accepts: [
        {
          contract: { id: 'tau.toolpath.gcode', version: 1 },
          mediaType: 'text/x.gcode',
          payloadSelection: 'single',
          requiredMembers: [],
          technology: 'subtractive.milling',
        },
      ],
      // The machine plays the file from its SD card and keeps running if the link drops.
      delivery: 'stored',
      start: 'remote',
      attestations: [
        { id: 'stock-clamped', label: 'The stock is clamped against the anchors' },
        { id: 'rack-loaded', label: 'Each pocket holds the tool the program expects' },
        { id: 'cover-closed', label: 'The cover is closed and nothing is inside but the stock' },
        { id: 'work-area-clear', label: 'The previous part is removed' },
      ],
      safety: { authority: 'person', attended: true, interlocks: ['cover', 'estop'] },
    },
    // Stop is the realtime halt (0x18), never the queue-draining abort.
    stop: {
      motion: 'halts',
      spindle: 'stops',
      heaters: 'none',
      position: 'may-be-lost',
      recovery: [
        { type: 'action', componentId: 'controller', action: 'controller.unlock' },
        { type: 'action', componentId: 'motion', action: 'motion.home' },
      ],
    },
    observations: [
      { group: 'state', label: 'State', staleAfter: 2000, delivery: 'retained' },
      { group: 'position', label: 'Position', staleAfter: 1000, delivery: 'latest' },
      { group: 'temperature', label: 'Temperatures', staleAfter: 5000, delivery: 'latest' },
      { group: 'tools', label: 'Tools', staleAfter: 5000, delivery: 'retained' },
      { group: 'inputs', label: 'Sensors', staleAfter: 3000, delivery: 'latest' },
      { group: 'accessories', label: 'Switches', staleAfter: 3000, delivery: 'latest' },
    ],
    qualifications: profile === undefined ? [] : [profile],
  };
};
