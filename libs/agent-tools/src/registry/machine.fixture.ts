/**
 * A Bambu X1C as the v3 machine contract describes it, for the machine tool tests. Shapes follow the lane conventions (component ids `controller`, `chamber-light`, `motion`, `tool-0`,
 * `bed`, `part-fan`, `filament`).
 *
 * @module
 */

import {
  defineMachineAction,
  machineActionDescriptorOf,
  parseMachineManifest,
  parseMachineProvider,
  standardMachineAction,
  standardMachineActions,
} from '@taucad/runtime/machine';
import type {
  ComponentObservation,
  MachineActionDescriptor,
  MachineComponentValue,
  MachineArtifactReference,
  MachineDirectoryEntry,
  MachineHaltOutcome,
  MachineManifest,
  MachineProvider,
  MachineRun,
  MachineSnapshot,
} from '@taucad/runtime/machine';

/** Every fixture instant. */
export const fixtureTimestamp = '2026-10-05T00:00:00.000Z';

const qualified = { status: 'qualified', profileId: 'x1c-hardware-2026-10' } as const;
const halt: MachineHaltOutcome = {
  motion: 'halts',
  spindle: 'none',
  heaters: 'off',
  position: 'kept',
  recovery: [{ type: 'action', componentId: 'motion', action: 'motion.home' }],
};

/** The chamber light switch; its form also serves as the fixture's start and binding form. */
const chamberLight = machineActionDescriptorOf(
  defineMachineAction(
    {
      componentId: 'chamber-light',
      id: 'switch.set',
      version: 1,
      label: 'Chamber light',
      effects: ['illumination'],
      scope: 'any',
      when: ['ready', 'active', 'held'],
      safety: { authority: 'agent', attended: false, interlocks: [] },
      requires: [],
      confirms: 'observation',
      qualification: qualified,
    },
    standardMachineActions['switch.set'].schema,
  ),
);

/**
 * The X1C's declared actions: a light (switch and level) and a speed profile the agent may use, a pause, a cancel and
 * a fan that need approval, a home and a jog that need a person, and an auxiliary fan not yet qualified.
 */
export const fixtureActions: readonly MachineActionDescriptor[] = [
  chamberLight,
  ...[
    standardMachineAction({
      id: 'run.pause',
      componentId: 'controller',
      label: 'Pause',
      when: ['active'],
      consequence: 'The print pauses after the current move.',
      outcome: { ...halt, heaters: 'unchanged', recovery: [] },
      confirms: 'observation',
      qualification: qualified,
    }),
    standardMachineAction({
      id: 'run.cancel',
      componentId: 'controller',
      label: 'Cancel the print',
      when: ['active', 'held'],
      consequence: 'The print stops and cannot be resumed.',
      outcome: halt,
      confirms: 'acknowledgement',
      qualification: qualified,
    }),
    standardMachineAction({
      id: 'level.set',
      componentId: 'part-fan',
      label: 'Part fan',
      when: ['ready', 'active', 'held'],
      confirms: 'observation',
      qualification: qualified,
    }),
    standardMachineAction({
      id: 'motion.home',
      componentId: 'motion',
      label: 'Home',
      when: ['ready'],
      qualification: qualified,
    }),
    standardMachineAction({
      id: 'level.set',
      componentId: 'chamber-light',
      componentKind: 'light',
      label: 'Chamber light level',
      when: ['ready', 'active', 'held'],
      confirms: 'acknowledgement',
      qualification: qualified,
    }),
    standardMachineAction({
      id: 'option.set',
      componentId: 'speed',
      componentKind: 'speed-profile',
      label: 'Print speed',
      when: ['active'],
      confirms: 'acknowledgement',
      qualification: qualified,
    }),
    standardMachineAction({
      id: 'motion.jog',
      componentId: 'motion',
      label: 'Jog',
      when: ['ready'],
      qualification: qualified,
    }),
    standardMachineAction({
      id: 'level.set',
      componentId: 'aux-fan',
      label: 'Auxiliary fan',
      when: ['ready', 'active', 'held'],
      confirms: 'acknowledgement',
      qualification: { status: 'designed', reason: 'Not yet tried on this printer.' },
    }),
  ].map((definition) => machineActionDescriptorOf(definition)),
];

/** The spindle a router adds: only a person at the machine runs it. */
const spindleAction = machineActionDescriptorOf(
  standardMachineAction({
    id: 'spindle.set',
    componentId: 'spindle',
    label: 'Spindle',
    when: ['ready'],
    qualification: qualified,
  }),
);

const printReady = {
  contract: { id: 'manufacturing.toolpath.bambu-gcode-3mf', version: 1 },
  mediaType: 'application/vnd.bambulab.gcode-3mf',
  requiredMembers: ['Metadata/plate_1.gcode'],
  payloadSelection: 'plate',
  technology: 'additive.fff',
};

const gcodeProgram = {
  contract: { id: 'tau.toolpath.gcode', version: 1 },
  mediaType: 'text/x-gcode',
  requiredMembers: [],
  payloadSelection: 'single',
  technology: 'subtractive.milling',
};

/** What differs from the X1C manifest. */
export type FixtureManifestInput = Readonly<{
  attestations?: ReadonlyArray<{ id: string; label: string }>;
  /** A router's milling process and spindle in place of the printer's process. */
  milling?: boolean;
}>;

const fffProcess = {
  type: 'fff',
  version: 1,
  geometry: {
    unit: 'mm',
    buildVolume: { x: 256, y: 256, z: 256 },
    enclosure: { outer: { x: 389, y: 389, z: 457 }, enclosed: true, doors: ['front'] },
    kinematics: 'corexy',
    bedMotion: 'z',
    origin: 'front-left',
    toolheadHome: { x: 1, y: 1, z: 1 },
    materialSystemMount: 'top',
  },
  filamentDiameter: { value: 1.75, unit: 'mm' },
  bed: {
    maximumTemperature: { value: 110, unit: 'Cel' },
    plates: [
      { id: 'textured-pei', label: 'Textured PEI' },
      { id: 'cool', label: 'Cool plate' },
    ],
  },
  chamber: { enclosed: true, heated: false },
  speedProfiles: [],
  slicing: {
    recommended: {
      layerHeight: { value: 0.2, unit: 'mm' },
      walls: 2,
      infillPercent: 15,
      nozzleTemperature: { value: 250, unit: 'Cel' },
      bedTemperature: { value: 70, unit: 'Cel' },
    },
    presets: [
      { id: 'fast', label: 'Fast', layerHeight: { value: 0.28, unit: 'mm' } },
      { id: 'standard', label: 'Standard', layerHeight: { value: 0.2, unit: 'mm' } },
      { id: 'fine', label: 'Fine', layerHeight: { value: 0.12, unit: 'mm' } },
    ],
  },
};

const millingProcess = { type: 'milling', version: 1, simultaneousAxes: 3, features: ['arcs'], workOffsets: ['G54'] };

/**
 * The X1C manifest, as the provider would declare it, parsed as a host admits one.
 * @param input - What differs.
 * @returns The manifest.
 */
export const fixtureManifest = ({ attestations = [], milling = false }: FixtureManifestInput = {}): MachineManifest =>
  parseMachineManifest({
    version: 3,
    identity: { typeId: 'bambu.x1c', vendor: 'Bambu Lab', model: 'x1c', displayName: 'Bambu Lab X1C' },
    connection: { transport: 'network', exclusive: false, opening: 'nothing', identity: 'authenticated' },
    axes: ['x', 'y', 'z'].map((id) => ({
      id,
      label: id.toUpperCase(),
      kind: 'linear',
      unit: 'mm',
      carries: 'tool',
      reference: 'cycle',
    })),
    components: [
      { id: 'controller', label: 'Printer', kind: 'controller' },
      { id: 'chamber-light', label: 'Chamber light', kind: 'light' },
      { id: 'motion', label: 'Motion', kind: 'motion', axes: ['x', 'y', 'z'] },
      {
        id: 'tool-0',
        label: 'Toolhead',
        kind: 'toolhead',
        nozzles: [
          {
            id: 'nozzle-0.4',
            diameter: { value: 0.4, unit: 'mm' },
            maximumTemperature: { value: 300, unit: 'Cel' },
            material: 'hardened',
          },
        ],
      },
      { id: 'bed', label: 'Bed', kind: 'heater' },
      { id: 'part-fan', label: 'Part fan', kind: 'fan' },
      { id: 'aux-fan', label: 'Auxiliary fan', kind: 'fan' },
      { id: 'speed', label: 'Print speed', kind: 'speed-profile' },
      ...(milling
        ? [{ id: 'spindle', label: 'Spindle', kind: 'spindle', control: 'switched', directions: ['clockwise'] }]
        : []),
      {
        id: 'filament',
        label: 'Filament',
        kind: 'material-system',
        units: [
          {
            id: 'ams-a',
            label: 'AMS',
            kind: 'feeder',
            slots: ['a1', 'a2', 'a3', 'a4'].map((id) => ({ id, label: id.toUpperCase() })),
          },
          { id: 'external', label: 'External spool', kind: 'external', slots: [{ id: 'spool', label: 'Spool' }] },
        ],
        routes: [
          { unitId: 'ams-a', toolheadIds: ['tool-0'] },
          { unitId: 'external', toolheadIds: ['tool-0'] },
        ],
      },
    ],
    processes: [milling ? millingProcess : fffProcess],
    actions: milling ? [...fixtureActions, spindleAction] : fixtureActions,
    holds: [],
    jobs: {
      type: 'supported',
      accepts: [milling ? gcodeProgram : printReady],
      delivery: 'stored',
      start: 'remote',
      submission: chamberLight.configuration,
      attestations,
      safety: { authority: 'approved-agent', attended: false, interlocks: [] },
    },
    stop: halt,
    observations: [],
    qualifications: [],
  });

/** The provider over {@link fixtureManifest}. */
export const fixtureProvider = (manifest = fixtureManifest()): MachineProvider =>
  parseMachineProvider({
    id: 'bambu',
    name: 'Bambu Lab',
    version: '1',
    protocolVersion: 2,
    vendor: 'Bambu Lab',
    manifest,
    bindingConfiguration: chamberLight.configuration,
  });

const observation = (componentId: string, group: string, value: MachineComponentValue): ComponentObservation => ({
  componentId,
  group,
  receivedAt: fixtureTimestamp,
  knowledge: 'known',
  value,
});

/** A loaded tray as the material system reports it. */
export type FixtureTray = Readonly<{
  unitId: string;
  slotId: string;
  state?: 'empty' | 'loaded' | 'unknown';
  materialType?: string;
  profileId?: string;
  color?: string;
}>;

/** What one fixture machine shows. */
export type FixtureEntryInput = Readonly<{
  machineId?: string;
  name?: string;
  status?: MachineSnapshot['state']['status'];
  /** The run it shows; `false` for none. */
  run?: MachineRun | false;
  /** The build plate it reports; `false` for none. */
  plate?: string | false;
  trays?: readonly FixtureTray[];
  attestations?: ReadonlyArray<{ id: string; label: string }>;
  /** A router: milling in place of the printer's process. */
  milling?: boolean;
  /** The person's testing switch for this machine. */
  testing?: boolean;
  snapshot?: Partial<MachineSnapshot>;
}>;

/** The run the fixture printer shows by default. */
export const fixtureRun: MachineRun = {
  runId: 'run-1',
  origin: 'tau',
  delivery: 'stored',
  state: 'running',
  program: { name: 'pyramid.gcode.3mf' },
  progress: {
    basis: 'executed',
    fraction: 0.42,
    remaining: 3_900_000,
    counters: [{ id: 'layer', label: 'Layer', current: 50, total: 125 }],
  },
};

/**
 * One X1C directory entry.
 * @param input - What differs from a printing X1C with PETG in AMS slot A1 and a textured plate.
 * @returns The entry.
 */
export const fixtureEntry = (input: FixtureEntryInput = {}): MachineDirectoryEntry => {
  const manifest = fixtureManifest({
    ...(input.attestations === undefined ? {} : { attestations: input.attestations }),
    ...(input.milling === undefined ? {} : { milling: input.milling }),
  });
  const trays = input.trays ?? [
    { unitId: 'ams-a', slotId: 'a1', materialType: 'PETG', profileId: 'GFG00', color: '#FF0000FF' },
  ];
  const run = input.run === false ? undefined : (input.run ?? fixtureRun);
  const plate = input.plate === false ? undefined : (input.plate ?? 'textured-pei');
  const components: ComponentObservation[] = [
    observation('chamber-light', 'accessories', { kind: 'switch', on: false }),
    observation('motion', 'position', {
      kind: 'motion',
      homed: { x: true, y: true, z: true },
      trust: 'homed',
      position: { machine: { x: 1, y: 2, z: 3 }, work: { x: 1, y: 2, z: 3 } },
      workOffset: { id: 'G54', revision: 'r1', origin: { x: 0, y: 0, z: 0 } },
      mode: 'normal',
      feed: 0,
      limits: [],
    }),
    observation('bed', 'temperature', {
      kind: 'readings',
      values: [
        { id: 'temperature', label: 'Bed', value: 60, target: 60 },
        ...(plate === undefined ? [] : [{ id: 'plate', label: 'Build plate', value: plate }]),
      ],
    }),
    observation('filament', 'material', {
      kind: 'material-system',
      slots: trays.map((tray) => ({
        slot: { unitId: tray.unitId, slotId: tray.slotId },
        state: tray.state ?? 'loaded',
        identifiedBy: 'tag',
        ...(tray.materialType === undefined
          ? {}
          : {
              material: {
                materialType: tray.materialType,
                color: tray.color ?? '#FFFFFFFF',
                preset: { profileId: tray.profileId ?? 'GFL99', settingId: '' },
                calibration: { type: 'default' },
              },
            }),
        editing: { allowed: true, duringRun: false },
      })),
      routes: [{ toolheadId: 'tool-0', current: null, target: null }],
    }),
  ];
  return {
    machineId: input.machineId ?? 'machine-1',
    name: input.name ?? 'Workshop X1C',
    providerId: 'bambu',
    freshness: 'current',
    ...(input.testing === undefined ? {} : { testing: input.testing }),
    descriptor: {
      id: 'physical-1',
      name: 'X1C',
      vendor: 'Bambu Lab',
      model: 'X1C',
      firmware: '01.08.00.00',
      capabilities: {
        connection: manifest.connection,
        axes: manifest.axes,
        components: manifest.components,
        processes: manifest.processes,
        actions: manifest.actions,
        holds: manifest.holds,
        jobs: manifest.jobs,
        stop: manifest.stop,
        revision: 'revision-1',
        incarnation: 'incarnation-1',
      },
    },
    snapshot: {
      connection: 'connected',
      observedAt: fixtureTimestamp,
      state: { status: input.status ?? (run === undefined ? 'ready' : 'active') },
      ...(run === undefined ? {} : { run }),
      components,
      activities: [],
      checks: [],
      availability: [],
      alerts: [],
      operations: [],
      ...input.snapshot,
    },
  };
};

/** A well-formed reference to a sliced plate in the project. */
export const fixtureArtifact: MachineArtifactReference = {
  projectId: 'proj_000000000000000000001',
  path: '.tau/artifacts/call-1__main.ts-gcode.3mf/pyramid.gcode.3mf',
  // SAFETY: a well-formed sha256 literal for the branded digest.
  digest: `sha256:${'d'.repeat(64)}` as MachineArtifactReference['digest'],
  length: 4096,
  mediaType: 'application/vnd.bambulab.gcode-3mf',
  contract: { id: 'manufacturing.toolpath.bambu-gcode-3mf', version: 1 },
  selectedMember: 'Metadata/plate_1.gcode',
};
