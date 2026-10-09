/**
 * Machine contract v3 fixtures shared by the Print pane, the printer viewer and Settings: manifests for a Bambu
 * X1C, an A1 mini, a Sienci LongMill (Grbl) and a Makera Carvera, built from the runtime's standard families, and
 * builders for the directory entries and observations the surfaces read. Nothing here reaches hardware.
 *
 * @module
 */

import { z } from 'zod';
import { defineConfiguration } from '@taucad/runtime/configuration';
import { quantity } from '@taucad/runtime/configuration/zod';
import {
  defineMachineAction,
  machineActionDescriptorOf,
  machineJogHold,
  parseMachineManifest,
  standardMachineAction,
} from '@taucad/runtime/machine';
import type {
  ComponentObservation,
  MachineActionDescriptor,
  MachineDirectoryEntry,
  MachineHaltOutcome,
  MachineHoldDescriptor,
  MachineManifest,
  MachineProvider,
  MachineReading,
  MachineSnapshot,
  MaterialSlotSnapshot,
} from '@taucad/runtime/machine';
import type { Quantity } from '@taucad/units/quantity';
import { quantityKinds } from '@taucad/units/quantity';

/** When every fixture observation was received. */
export const observedAt = '2026-09-24T02:00:00.000Z';

/** A quantity as a machine reports it; the surfaces read only the value and the unit code. */
export const observedQuantity = (value: number, code: string): Quantity => {
  const candidate: unknown = { value, unit: { code }, space: 'point', assumptions: [] };
  // SAFETY: fixtures never convert; only `value` and `unit.code` are read.
  return candidate as Quantity;
};

const millimetres = (value: number) => ({ value, unit: 'mm' });
const celsius = (value: number) => ({ value, unit: 'Cel' });

/** The X1C's hardware evidence profile: what was proven on the operator's printer. */
export const x1cHardwareProfile = 'x1c-hardware-2026-10';
const qualified = { status: 'qualified', profileId: x1cHardwareProfile } as const;
const ready = ['ready'] as const;
const anyState = ['ready', 'active', 'held'] as const;

const action = (input: Parameters<typeof standardMachineAction>[0]): MachineActionDescriptor =>
  machineActionDescriptorOf(standardMachineAction(input));

const fffStop: MachineHaltOutcome = {
  motion: 'halts',
  spindle: 'none',
  heaters: 'off',
  position: 'kept',
  recovery: [],
};
const fffPause: MachineHaltOutcome = {
  motion: 'decelerates',
  spindle: 'none',
  heaters: 'unchanged',
  position: 'kept',
  recovery: [{ type: 'action', componentId: 'controller', action: 'run.resume' }],
};
const fffCancel: MachineHaltOutcome = {
  motion: 'halts',
  spindle: 'none',
  heaters: 'off',
  position: 'kept',
  recovery: [],
};

/**
 * The submission form a Bambu job carries; mirrors `bambu.machine.submission` 1.3.0 without depending on the plugin:
 * the `expected*` facts are optional because the provider reads them from the program, never from the sender.
 */
export const bambuSubmission = defineConfiguration({
  id: 'fixture.submission',
  version: '1.3.0',
  schema: z.object({
    amsMapping: z.array(z.number().int()).default([]),
    bedLeveling: z.boolean().default(true),
    flowCalibration: z.boolean().default(true),
    expectedBedType: z.string().min(1).optional(),
    expectedMaterials: z.array(z.object({ slot: z.number().int(), materialId: z.string() })).default([]),
    expectedFilamentDiameter: quantity({
      unit: 'mm',
      quantityKind: quantityKinds.diameter,
      space: 'linear',
    })
      .positive()
      .optional(),
    expectedNozzleDiameter: quantity({ unit: 'mm', quantityKind: quantityKinds.diameter, space: 'linear' })
      .positive()
      .optional(),
    expectedModel: z.literal('X1C').optional(),
    operatorConfirmedBedType: z.string().min(1).optional(),
    timelapse: z.boolean().default(false),
  }),
  ui: { version: 1, rjsf: {} },
});

const millingSubmission = defineConfiguration({
  id: 'fixture.milling-submission',
  version: '1',
  schema: z.object({ startLine: z.number().int().min(1).default(1) }),
  ui: { version: 1, rjsf: {} },
});

/** The container a Bambu printer accepts. */
export const bambuContainer = {
  contract: { id: 'manufacturing.toolpath.bambu-gcode-3mf', version: 1 },
  mediaType: 'application/vnd.bambulab.gcode-3mf',
  requiredMembers: ['Metadata/plate_1.gcode'],
  payloadSelection: 'plate',
  technology: 'additive.fff',
} as const;

const gcodeContainer = {
  contract: { id: 'manufacturing.toolpath.gcode', version: 1 },
  mediaType: 'text/x.gcode',
  extensions: ['.gcode', '.nc', '.ngc', '.tap'],
  requiredMembers: [],
  payloadSelection: 'single',
  technology: 'subtractive.milling',
} as const;

const readTag = machineActionDescriptorOf(
  defineMachineAction(
    {
      componentId: 'filament',
      id: 'bambu.ams.read-tag',
      version: 1,
      label: 'Read spool tag',
      effects: ['material'],
      scope: 'idle',
      when: ready,
      safety: { authority: 'approved-agent', attended: false, interlocks: [] },
      requires: [],
      confirms: 'observation',
    },
    z.strictObject({ unitId: z.string(), slotId: z.string() }),
  ),
);

/** Every material and calibration action an FFF printer with a material system declares. */
const materialActions = (): readonly MachineActionDescriptor[] => [
  action({
    id: 'material.load',
    componentId: 'filament',
    label: 'Load',
    when: ready,
    consequence: 'The printer heats the nozzle and feeds filament.',
  }),
  action({ id: 'material.unload', componentId: 'filament', label: 'Unload', when: ready }),
  action({ id: 'material.set', componentId: 'filament', label: 'Set material', when: ready, confirms: 'observation' }),
  action({ id: 'material.clear', componentId: 'filament', label: 'Clear material', when: ready }),
  action({
    id: 'material.calibration.select',
    componentId: 'filament',
    label: 'Use a pressure-advance profile',
    when: ready,
  }),
  action({
    id: 'material.calibration.save',
    componentId: 'filament',
    label: 'Save a pressure-advance profile',
    when: ready,
  }),
  action({
    id: 'material.calibration.delete',
    componentId: 'filament',
    label: 'Delete a pressure-advance profile',
    when: ready,
  }),
  action({
    id: 'material.calibration.run',
    componentId: 'filament',
    label: 'Calibrate',
    when: ready,
    consequence: 'The printer heats, prints test lines on the plate and scans them.',
  }),
  action({ id: 'interaction.respond', componentId: 'filament', label: 'Answer the filament check', when: anyState }),
  readTag,
];

const fffObservations = [
  { group: 'state', label: 'State', staleAfter: 15_000, delivery: 'retained' },
  { group: 'temperature', label: 'Temperatures', staleAfter: 15_000, delivery: 'latest' },
  { group: 'material', label: 'Material', staleAfter: 30_000, delivery: 'retained' },
  { group: 'accessories', label: 'Accessories', staleAfter: 30_000, delivery: 'retained' },
] as const;

const bambuJobs = {
  type: 'supported',
  accepts: [bambuContainer],
  delivery: 'stored',
  start: 'remote',
  submission: bambuSubmission.manifest,
  attestations: [{ id: 'work-area-clear', label: 'The build plate is clear' }],
  safety: { authority: 'approved-agent', attended: false, interlocks: [] },
} as const;

/** Bambu Lab X1 Carbon, manifest v3: enclosed CoreXY with a four-slot AMS and an external spool. */
export const x1cManifest: MachineManifest = parseMachineManifest({
  version: 3,
  identity: { typeId: 'bambu.x1c', vendor: 'Bambu Lab', model: 'x1c', displayName: 'X1 Carbon', family: 'X1' },
  connection: { transport: 'network', exclusive: false, opening: 'nothing', identity: 'authenticated' },
  axes: [
    {
      id: 'x',
      label: 'X',
      kind: 'linear',
      unit: 'mm',
      travel: { min: 0, max: 256 },
      carries: 'tool',
      reference: 'cycle',
    },
    {
      id: 'y',
      label: 'Y',
      kind: 'linear',
      unit: 'mm',
      travel: { min: 0, max: 256 },
      carries: 'tool',
      reference: 'cycle',
    },
    {
      id: 'z',
      label: 'Z',
      kind: 'linear',
      unit: 'mm',
      travel: { min: 0, max: 256 },
      carries: 'work',
      reference: 'cycle',
    },
  ],
  components: [
    { id: 'controller', label: 'Printer', kind: 'controller' },
    { id: 'chamber-light', label: 'Chamber light', kind: 'light' },
    { id: 'speed', label: 'Print speed', kind: 'speed-profile' },
    { id: 'motion', label: 'Axes', kind: 'motion', axes: ['x', 'y', 'z'] },
    {
      id: 'tool-0',
      label: 'Toolhead',
      kind: 'toolhead',
      nozzles: [{ id: 'nozzle-0', diameter: millimetres(0.4), maximumTemperature: celsius(300), material: 'hardened' }],
    },
    { id: 'bed', label: 'Bed', kind: 'heater' },
    { id: 'chamber', label: 'Chamber', kind: 'enclosure' },
    { id: 'part-fan', label: 'Part fan', kind: 'fan' },
    { id: 'aux-fan', label: 'Auxiliary fan', kind: 'fan' },
    { id: 'chamber-fan', label: 'Chamber fan', kind: 'fan' },
    { id: 'camera', label: 'Camera', kind: 'camera' },
    {
      id: 'filament',
      label: 'Filament',
      kind: 'material-system',
      units: [
        {
          id: 'ams-a',
          label: 'AMS',
          kind: 'feeder',
          slots: [
            { id: 'a1', label: 'A1' },
            { id: 'a2', label: 'A2' },
            { id: 'a3', label: 'A3' },
            { id: 'a4', label: 'A4' },
          ],
        },
        { id: 'external', label: 'External spool', kind: 'external', slots: [{ id: 'spool', label: 'Ext' }] },
      ],
      routes: [
        { unitId: 'ams-a', toolheadIds: ['tool-0'] },
        { unitId: 'external', toolheadIds: ['tool-0'] },
      ],
    },
  ],
  processes: [
    {
      type: 'fff',
      version: 1,
      geometry: {
        unit: 'mm',
        buildVolume: { x: 256, y: 256, z: 256 },
        enclosure: { outer: { x: 389, y: 389, z: 457 }, enclosed: true, doors: ['front', 'top'] },
        kinematics: 'corexy',
        bedMotion: 'z',
        origin: 'front-left',
        toolheadHome: { x: 128, y: 256, z: 256 },
        materialSystemMount: 'top',
      },
      filamentDiameter: millimetres(1.75),
      bed: {
        maximumTemperature: celsius(120),
        plates: [
          { id: 'cool', label: 'Cool plate' },
          { id: 'textured-pei', label: 'Textured PEI plate' },
        ],
      },
      chamber: { enclosed: true, heated: false },
      speedProfiles: [
        { id: 'silent', label: 'Silent', percent: 50 },
        { id: 'standard', label: 'Standard', percent: 100 },
        { id: 'sport', label: 'Sport', percent: 124 },
        { id: 'ludicrous', label: 'Ludicrous', percent: 166 },
      ],
      slicing: {
        recommended: {
          layerHeight: millimetres(0.2),
          walls: 2,
          infillPercent: 15,
          nozzleTemperature: celsius(220),
          bedTemperature: celsius(55),
        },
        presets: [
          { id: 'fast', label: 'Fast', layerHeight: millimetres(0.28) },
          { id: 'standard', label: 'Standard', layerHeight: millimetres(0.2) },
          { id: 'fine', label: 'Fine', layerHeight: millimetres(0.12) },
        ],
      },
    },
  ],
  actions: [
    action({ id: 'switch.set', componentId: 'chamber-light', label: 'Chamber light', when: anyState }),
    action({
      id: 'option.set',
      componentId: 'speed',
      label: 'Print speed',
      when: ['active', 'held'],
      safety: { authority: 'agent' },
    }),
    action({
      id: 'run.pause',
      componentId: 'controller',
      label: 'Pause',
      when: ['active'],
      consequence: 'The nozzle parks and stays hot.',
      outcome: fffPause,
      qualification: qualified,
    }),
    action({ id: 'run.resume', componentId: 'controller', label: 'Resume', when: ['held'], qualification: qualified }),
    action({
      id: 'run.cancel',
      componentId: 'controller',
      label: 'Cancel print',
      when: ['active', 'held'],
      consequence: 'The print cannot be continued.',
      outcome: fffCancel,
      qualification: qualified,
    }),
    action({ id: 'level.set', componentId: 'part-fan', label: 'Part fan', when: anyState }),
    action({ id: 'level.set', componentId: 'aux-fan', label: 'Auxiliary fan', when: anyState }),
    ...materialActions(),
  ],
  holds: [],
  jobs: bambuJobs,
  stop: fffStop,
  observations: fffObservations,
  qualifications: [
    {
      id: x1cHardwareProfile,
      environment: 'hardware',
      model: 'X1C',
      firmware: ['01.08.02.00'],
      attachments: ['filament'],
      evidence: 'Operator runs on the workshop X1C, October 2026.',
    },
  ],
});

/** Bambu Lab A1 mini: an open bed-slinger with a four-slot AMS lite and an external spool. */
export const a1MiniManifest: MachineManifest = parseMachineManifest({
  ...x1cManifest,
  identity: { typeId: 'bambu.a1-mini', vendor: 'Bambu Lab', model: 'a1-mini', displayName: 'A1 mini', family: 'A1' },
  components: x1cManifest.components
    .filter((component) => !['chamber-light', 'chamber', 'aux-fan', 'chamber-fan'].includes(component.id))
    .map((component) =>
      component.kind === 'material-system'
        ? {
            ...component,
            units: component.units.map((unit) => (unit.id === 'ams-a' ? { ...unit, label: 'AMS lite' } : unit)),
          }
        : component,
    ),
  processes: [
    {
      ...x1cManifest.processes[0],
      geometry: {
        unit: 'mm',
        buildVolume: { x: 180, y: 180, z: 180 },
        enclosure: { outer: { x: 347, y: 315, z: 365 }, enclosed: false, doors: [] },
        kinematics: 'cartesian-bedslinger',
        bedMotion: 'y',
        origin: 'front-left',
        toolheadHome: { x: 1, y: 1, z: 180 },
        materialSystemMount: 'side',
      },
      chamber: { enclosed: false, heated: false },
    },
  ],
  actions: x1cManifest.actions.filter((descriptor) => !['chamber-light', 'aux-fan'].includes(descriptor.componentId)),
  qualifications: [],
});

const routerPause: MachineHaltOutcome = {
  motion: 'decelerates',
  spindle: 'keeps-turning',
  heaters: 'none',
  position: 'kept',
  recovery: [{ type: 'action', componentId: 'controller', action: 'run.resume' }],
};

/** Sienci LongMill MK2 on the LongBoard (Grbl 1.1h): streamed, started at the machine, relay-switched router. */
export const routerManifest: MachineManifest = parseMachineManifest({
  version: 3,
  identity: {
    typeId: 'sienci.longmill',
    vendor: 'Sienci Labs',
    model: 'longmill-mk2-30',
    displayName: 'LongMill MK2 30×30',
  },
  connection: { transport: 'serial', exclusive: true, opening: 'resets-controller', identity: 'claimed' },
  axes: [
    {
      id: 'x',
      label: 'X',
      kind: 'linear',
      unit: 'mm',
      travel: { min: 0, max: 810 },
      carries: 'tool',
      reference: 'cycle',
    },
    {
      id: 'y',
      label: 'Y',
      kind: 'linear',
      unit: 'mm',
      travel: { min: 0, max: 855 },
      carries: 'tool',
      reference: 'cycle',
    },
    {
      id: 'z',
      label: 'Z',
      kind: 'linear',
      unit: 'mm',
      travel: { min: -120, max: 0 },
      carries: 'tool',
      reference: 'cycle',
    },
  ],
  components: [
    { id: 'controller', label: 'LongBoard', kind: 'controller' },
    { id: 'motion', label: 'Axes', kind: 'motion', axes: ['x', 'y', 'z'] },
    { id: 'router', label: 'Router', kind: 'spindle', control: 'switched', directions: ['clockwise'] },
    {
      id: 'tools',
      label: 'Bit',
      kind: 'tools',
      change: 'manual',
      pockets: 0,
      measures: 'on-request',
      lengthReference: 'none',
    },
    { id: 'touch-plate', label: 'Touch plate', kind: 'probe', finds: 'work' },
    { id: 'dust', label: 'Dust collector', kind: 'extraction' },
    { id: 'feed-override', label: 'Feed', kind: 'override' },
    { id: 'rapid-override', label: 'Rapids', kind: 'override' },
  ],
  processes: [
    {
      type: 'milling',
      version: 1,
      simultaneousAxes: 3,
      features: ['arcs'],
      workOffsets: ['G54', 'G55', 'G56', 'G57', 'G58', 'G59'],
      workArea: { x: 810, y: 855, z: 120 },
    },
  ],
  actions: [
    action({
      id: 'run.pause',
      componentId: 'controller',
      label: 'Feed hold',
      when: ['active'],
      consequence: 'Motion slows to a stop. The router keeps spinning in the cut.',
      outcome: routerPause,
      safety: { authority: 'approved-agent' },
    }),
    action({
      id: 'run.resume',
      componentId: 'controller',
      label: 'Resume',
      when: ['held'],
      consequence: 'Motion restarts where it stopped.',
      safety: { authority: 'person', attended: true },
    }),
    action({
      id: 'run.cancel',
      componentId: 'controller',
      label: 'Stop job',
      when: ['active', 'held'],
      consequence: 'The job cannot be continued from here.',
      outcome: { motion: 'decelerates', spindle: 'stops', heaters: 'none', position: 'kept', recovery: [] },
    }),
    action({
      id: 'controller.unlock',
      componentId: 'controller',
      label: 'Unlock',
      when: ['alarm'],
      consequence: 'Clears the alarm without homing. The position may be wrong until the machine homes.',
    }),
    action({ id: 'motion.home', componentId: 'motion', label: 'Home', when: ['ready', 'alarm'] }),
    action({ id: 'motion.jog', componentId: 'motion', label: 'Jog', when: ready }),
    action({ id: 'motion.move', componentId: 'motion', label: 'Go to', when: ready }),
    action({ id: 'work-offset.select', componentId: 'motion', label: 'Use work offset', when: ready }),
    action({ id: 'work-offset.set', componentId: 'motion', label: 'Set zero here', when: ready }),
    action({
      id: 'probe.run',
      componentId: 'touch-plate',
      label: 'Probe with the touch plate',
      when: ready,
      // As the Grbl provider narrows it: the touch plate probes Z only.
      schema: z.strictObject({ cycle: z.enum(['z']).meta({ title: 'Cycle' }) }),
      consequence: 'The bit moves down until it touches the plate. Attach the magnet first; the router must be off.',
    }),
    action({
      id: 'tool.change',
      componentId: 'tools',
      label: 'Change bit',
      when: ready,
      confirms: 'none',
      consequence: 'The machine parks, a person changes the bit, then Z is probed again.',
    }),
    action({
      id: 'spindle.set',
      componentId: 'router',
      label: 'Router',
      when: ready,
      confirms: 'acknowledgement',
      consequence: 'Tau switches the relay; the speed is set on the router’s own dial.',
    }),
    action({
      id: 'switch.set',
      componentId: 'dust',
      label: 'Dust collector',
      when: anyState,
      confirms: 'acknowledgement',
    }),
    action({ id: 'level.set', componentId: 'feed-override', label: 'Feed override', when: ['active', 'held'] }),
    action({ id: 'option.set', componentId: 'rapid-override', label: 'Rapid override', when: ['active', 'held'] }),
    action({
      id: 'interaction.respond',
      componentId: 'controller',
      label: 'Continue',
      when: ['held'],
      safety: { attended: true },
    }),
  ],
  holds: [
    machineActionDescriptorOf(machineJogHold({ componentId: 'motion', lease: 100, bound: 150 })),
  ] as readonly MachineHoldDescriptor[],
  jobs: {
    type: 'supported',
    accepts: [gcodeContainer],
    delivery: 'streamed',
    start: 'at-machine',
    submission: millingSubmission.manifest,
    attestations: [
      { id: 'stock-clamped', label: 'The stock is clamped and nothing loose is on the bed' },
      { id: 'bit-installed', label: 'The bit in the router is the first one the program uses' },
      { id: 'router-on', label: 'The router is switched on at its own switch, dial set' },
      { id: 'work-area-clear', label: 'The previous part is removed and the bed is clear' },
    ],
    safety: { authority: 'person', attended: true, interlocks: [] },
  },
  stop: { motion: 'decelerates', spindle: 'stops', heaters: 'none', position: 'kept', recovery: [] },
  observations: [
    { group: 'state', label: 'State', staleAfter: 5000, delivery: 'retained' },
    { group: 'position', label: 'Position', staleAfter: 2000, delivery: 'latest' },
    { group: 'tools', label: 'Tools', staleAfter: 60_000, delivery: 'retained' },
    { group: 'inputs', label: 'Inputs', staleAfter: 5000, delivery: 'retained' },
    { group: 'accessories', label: 'Accessories', staleAfter: 30_000, delivery: 'retained' },
  ],
  qualifications: [],
});

/** Makera Carvera C1: stored jobs, a six-pocket changer, a wireless probe and a cover interlock. */
export const carveraManifest: MachineManifest = parseMachineManifest({
  ...routerManifest,
  identity: { typeId: 'makera.carvera', vendor: 'Makera', model: 'carvera-c1', displayName: 'Carvera C1' },
  connection: { transport: 'network', exclusive: true, opening: 'nothing', identity: 'claimed' },
  components: [
    { id: 'controller', label: 'Carvera', kind: 'controller' },
    { id: 'motion', label: 'Axes', kind: 'motion', axes: ['x', 'y', 'z'] },
    {
      id: 'spindle',
      label: 'Spindle',
      kind: 'spindle',
      control: 'programmed',
      speed: { min: 0, max: 15_000 },
      directions: ['clockwise'],
    },
    {
      id: 'tools',
      label: 'Tool changer',
      kind: 'tools',
      change: 'automatic',
      pockets: 6,
      measures: 'on-change',
      lengthReference: 'reference-tool',
    },
    { id: 'probe', label: 'Wireless probe', kind: 'probe', finds: 'work' },
    { id: 'tool-setter', label: 'Tool setter', kind: 'probe', finds: 'tool-length' },
    { id: 'cover', label: 'Enclosure cover', kind: 'interlock', guards: 'door' },
    { id: 'estop', label: 'Emergency stop', kind: 'interlock', guards: 'emergency-stop' },
    { id: 'light', label: 'Light', kind: 'light' },
    { id: 'vacuum', label: 'Vacuum', kind: 'vacuum' },
    { id: 'feed-override', label: 'Feed', kind: 'override' },
  ],
  processes: [
    {
      type: 'milling',
      version: 1,
      simultaneousAxes: 3,
      features: ['arcs', 'canned-cycles'],
      workOffsets: ['G54', 'G55', 'G56'],
      workArea: { x: 340, y: 240, z: 140 },
    },
  ],
  actions: [
    action({
      id: 'run.pause',
      componentId: 'controller',
      label: 'Pause',
      when: ['active'],
      consequence: 'Queued moves finish first. The spindle keeps turning until you stop it.',
      outcome: {
        motion: 'finishes-queued',
        spindle: 'keeps-turning',
        heaters: 'none',
        position: 'kept',
        recovery: [{ type: 'action', componentId: 'controller', action: 'run.resume' }],
      },
      safety: { authority: 'approved-agent' },
    }),
    action({
      id: 'run.resume',
      componentId: 'controller',
      label: 'Resume',
      when: ['held'],
      safety: { authority: 'person', attended: true, interlocks: ['cover'] },
    }),
    action({
      id: 'run.cancel',
      componentId: 'controller',
      label: 'Stop job',
      when: ['active', 'held'],
      outcome: { motion: 'finishes-queued', spindle: 'stops', heaters: 'none', position: 'kept', recovery: [] },
    }),
    action({ id: 'controller.unlock', componentId: 'controller', label: 'Unlock', when: ['alarm'] }),
    action({
      id: 'controller.wake',
      componentId: 'controller',
      label: 'Wake',
      when: ['asleep'],
      consequence: 'The machine restarts and homes by itself.',
    }),
    action({
      id: 'motion.home',
      componentId: 'motion',
      label: 'Home',
      when: ['ready', 'alarm'],
      safety: { interlocks: ['cover'] },
    }),
    action({ id: 'motion.jog', componentId: 'motion', label: 'Jog', when: ready }),
    action({ id: 'work-offset.set', componentId: 'motion', label: 'Set work origin', when: ready }),
    action({
      id: 'probe.run',
      componentId: 'probe',
      label: 'Probe',
      when: ready,
      safety: { interlocks: ['cover'] },
      // As the Carvera provider narrows it.
      schema: z.strictObject({ cycle: z.enum(['z-surface', 'corner', 'bore-centre']).meta({ title: 'Cycle' }) }),
    }),
    action({
      id: 'tool.change',
      componentId: 'tools',
      label: 'Change tool',
      when: ready,
      safety: { interlocks: ['cover'] },
      consequence: 'The spindle drops its tool in its pocket, picks the new one and measures it.',
    }),
    action({
      id: 'tool.measure',
      componentId: 'tool-setter',
      label: 'Measure tool',
      when: ready,
      safety: { interlocks: ['cover'] },
    }),
    action({
      id: 'spindle.set',
      componentId: 'spindle',
      label: 'Spindle',
      when: ready,
      safety: { interlocks: ['cover'] },
    }),
    action({ id: 'switch.set', componentId: 'light', label: 'Light', when: anyState }),
    action({ id: 'switch.set', componentId: 'vacuum', label: 'Vacuum', when: anyState }),
    action({ id: 'level.set', componentId: 'feed-override', label: 'Feed override', when: ['active', 'held'] }),
  ],
  holds: [
    machineActionDescriptorOf(machineJogHold({ componentId: 'motion', lease: 100, bound: 150, interlocks: ['cover'] })),
  ] as readonly MachineHoldDescriptor[],
  jobs: {
    type: 'supported',
    accepts: [gcodeContainer],
    delivery: 'stored',
    start: 'remote',
    submission: millingSubmission.manifest,
    attestations: [
      { id: 'stock-clamped', label: 'The stock is clamped against the anchors' },
      { id: 'rack-loaded', label: 'Each pocket holds the tool the program expects' },
      { id: 'work-area-clear', label: 'The previous part is removed' },
    ],
    safety: { authority: 'person', attended: true, interlocks: ['cover', 'estop'] },
  },
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
});

const bindingConfiguration = defineConfiguration({
  id: 'fixture.binding',
  version: '1',
  schema: z.object({}),
  ui: { version: 1, rjsf: {} },
});

/**
 * A provider for one manifest.
 *
 * @param id - The provider id; one containing `simulator` reads as simulated.
 * @param manifest - The model it serves.
 * @returns The provider.
 */
export const providerFor = (id: string, manifest: MachineManifest): MachineProvider => ({
  id,
  name: id,
  version: '1',
  protocolVersion: 2,
  vendor: manifest.identity.vendor,
  manifest,
  bindingConfiguration: bindingConfiguration.manifest,
});

/**
 * One known component observation, fresh until replaced; spread `validUntil` onto it for one that goes stale.
 *
 * @param componentId - The component.
 * @param group - Its observation group.
 * @param value - What it reports.
 * @returns The observation.
 */
export const known = (
  componentId: string,
  group: string,
  value: Extract<ComponentObservation, { knowledge: 'known' }>['value'],
): ComponentObservation => ({ componentId, group, receivedAt: observedAt, knowledge: 'known', value });

/**
 * A heater reading in °C, labelled by its id: `nozzle` reads "Nozzle".
 *
 * @param id - The reading id.
 * @param value - Degrees now.
 * @param target - Degrees commanded, for a heater driven toward one.
 * @returns The reading.
 */
export const temperature = (id: string, value: number, target?: number): MachineReading => ({
  id,
  label: `${id.charAt(0).toUpperCase()}${id.slice(1)}`,
  value: observedQuantity(value, 'Cel'),
  ...(target === undefined ? {} : { target: observedQuantity(target, 'Cel') }),
});

/** A tag-read PLA spool in A1 and an empty A2, and nothing set on the external holder. */
export const fffSlots: readonly MaterialSlotSnapshot[] = [
  {
    slot: { unitId: 'ams-a', slotId: 'a1' },
    state: 'loaded',
    identifiedBy: 'tag',
    material: {
      materialType: 'PLA',
      color: '#000000FF',
      preset: { profileId: 'GFA01', settingId: 'GFSA01' },
      nozzleTemperature: { min: observedQuantity(190, 'Cel'), max: observedQuantity(230, 'Cel') },
      brand: 'Bambu',
      calibration: { type: 'default' },
    },
    remainingPercent: 80,
    editing: { allowed: false, duringRun: false, reason: 'The AMS read this spool’s tag, which sets its material.' },
  },
  {
    slot: { unitId: 'ams-a', slotId: 'a2' },
    state: 'empty',
    identifiedBy: 'unset',
    editing: { allowed: true, duringRun: false },
  },
  {
    slot: { unitId: 'external', slotId: 'spool' },
    state: 'unknown',
    identifiedBy: 'unset',
    editing: { allowed: true, duringRun: false },
  },
];

/**
 * What an idle FFF printer reports: heaters, light, fans, speed and the material system.
 *
 * @param slots - The material slots.
 * @returns The component observations.
 */
export const fffComponents = (slots: readonly MaterialSlotSnapshot[] = fffSlots): readonly ComponentObservation[] => [
  known('tool-0', 'temperature', { kind: 'readings', values: [temperature('nozzle', 28)] }),
  known('bed', 'temperature', { kind: 'readings', values: [temperature('bed', 24)] }),
  known('chamber', 'temperature', { kind: 'readings', values: [temperature('chamber', 25)] }),
  known('chamber-light', 'accessories', { kind: 'switch', on: false }),
  known('part-fan', 'accessories', { kind: 'level', ratio: 0 }),
  known('filament', 'material', {
    kind: 'material-system',
    slots,
    calibrations: {
      revision: 'k-1',
      rows: [
        {
          profileId: 'k-pla',
          name: 'PLA Basic 0.4',
          preset: { profileId: 'GFA01', settingId: 'GFSA01' },
          nozzleId: 'nozzle-0',
          pressureAdvance: 0.02,
        },
      ],
    },
    routes: [{ toolheadId: 'tool-0', current: { unitId: 'ams-a', slotId: 'a1' }, target: null }],
    units: [{ unitId: 'ams-a', humidityIndex: 2, temperature: observedQuantity(26, 'Cel') }],
  }),
];

/**
 * What an idle, homed milling machine reports.
 *
 * @param manifest - The router or Carvera manifest.
 * @returns The component observations.
 */
export const millingComponents = (manifest: MachineManifest): readonly ComponentObservation[] => [
  known('motion', 'position', {
    kind: 'motion',
    homed: { x: true, y: true, z: true },
    trust: 'homed',
    position: { machine: { x: 400, y: 420, z: -10 }, work: { x: 100, y: 120, z: 5 } },
    workOffset: { id: 'G54', revision: 'wo-1', origin: { x: 300, y: 300, z: -15 } },
    mode: 'normal',
    feed: 0,
    limits: [],
  }),
  known(manifest.components.find((component) => component.kind === 'spindle')?.id ?? 'spindle', 'state', {
    kind: 'spindle',
    mode: 'off',
    commanded: 0,
  }),
  known('tools', 'tools', {
    kind: 'tools',
    current: 1,
    table: { revision: 't-1', rows: [{ number: 1, description: '1/4" end mill', diameter: 6.35, measured: true }] },
  }),
  known('feed-override', 'state', { kind: 'level', ratio: 1 }),
  ...manifest.components
    .filter((component) => component.kind === 'interlock')
    .map((component) => known(component.id, 'inputs', { kind: 'interlock', state: 'safe' })),
];

/**
 * An idle snapshot with the given components.
 *
 * @param components - What the machine reports.
 * @param overrides - Anything else to change.
 * @returns The snapshot.
 */
export const machineSnapshot = (
  components: readonly ComponentObservation[],
  overrides: Partial<MachineSnapshot> = {},
): MachineSnapshot => ({
  connection: 'connected',
  observedAt,
  state: { status: 'ready' },
  components,
  activities: [],
  checks: [],
  availability: [],
  alerts: [],
  operations: [],
  ...overrides,
});

/**
 * A machine as the directory reports it.
 *
 * @param input - The manifest, identity and snapshot.
 * @returns The entry.
 */
export const machineEntry = ({
  manifest,
  machineId = 'machine-1',
  name = 'Workshop X1C',
  providerId = 'bambu-simulator',
  firmware = '01.08.02.00',
  snapshot,
  testing,
  freshness = 'current',
}: {
  readonly manifest: MachineManifest;
  readonly machineId?: string;
  readonly name?: string;
  readonly providerId?: string;
  readonly firmware?: string;
  readonly snapshot?: MachineSnapshot;
  readonly testing?: boolean;
  readonly freshness?: MachineDirectoryEntry['freshness'];
}): MachineDirectoryEntry => ({
  machineId,
  name,
  providerId,
  descriptor: {
    id: `physical-${machineId}`,
    name: `${manifest.identity.model}-device`,
    vendor: manifest.identity.vendor,
    model: manifest.identity.model,
    firmware,
    capabilities: {
      connection: manifest.connection,
      axes: manifest.axes,
      components: manifest.components,
      processes: manifest.processes,
      actions: manifest.actions,
      holds: manifest.holds,
      jobs: manifest.jobs,
      stop: manifest.stop,
      revision: 'capabilities-1',
      incarnation: 'session-1',
      qualifications: manifest.qualifications,
    },
  },
  snapshot:
    snapshot ??
    machineSnapshot(
      manifest.processes.some((process) => process.type === 'fff') ? fffComponents() : millingComponents(manifest),
    ),
  freshness,
  ...(testing === undefined ? {} : { testing }),
});
