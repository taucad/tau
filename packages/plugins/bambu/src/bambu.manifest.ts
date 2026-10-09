import { defineConfiguration } from '@taucad/runtime/configuration';
import { quantity } from '@taucad/runtime/configuration/zod';
import {
  defineMachineAction,
  machineManifestOf,
  standardMachineAction,
  standardMachineActions,
} from '@taucad/runtime/machine';
import type {
  MachineAcceptedContainer,
  MachineActionDefinition,
  MachineActionQualification,
  MachineComponent,
  MachineHaltOutcome,
  MachineManifest,
  MachineManifestDefinition,
  MachineStatus,
} from '@taucad/runtime/machine';
import { quantityKinds } from '@taucad/units/quantity';
import { z } from 'zod';

import { bambuExternalSpoolSlot } from '#bambu.protocol.js';

const millimetres = (value: number) => ({ value, unit: 'mm' });
const celsius = (value: number) => ({ value, unit: 'Cel' });
const seconds = (value: number): number => value * 1000;

/**
 * AMS trays (`ams_id * 4 + tray`) up to `last`, then the external spool, as Bambu numbers them.
 * One enum rather than a range-or-constant union: the parameter compiler refuses union branches
 * with different constraints, and the submission form would never compile.
 * @param last - The last AMS tray the machine has.
 * @param extra - Further values the field accepts, such as `-1` for an unmapped filament.
 * @returns The slot enum.
 */
const traySlots = (last: number, ...extra: number[]) =>
  z.literal([...Array.from({ length: last + 1 }, (_, slot) => slot), bambuExternalSpoolSlot, ...extra]);

/**
 * Submission schema shared by the LAN provider and the simulator. Trays 0–15 are the four AMS units an X1C takes;
 * the installed capabilities name the ones the printer reports. The `expected*` keys are what the file says it was
 * sliced for, filled from the file; one the file does not state is left out and preparation blocks on it.
 * @internal
 */
export const bambuSubmissionConfiguration = defineConfiguration({
  id: 'bambu.machine.submission',
  version: '1.3.0',
  schema: z.strictObject({
    amsMapping: z.array(traySlots(15, -1)).max(16).default([]),
    bedLeveling: z.boolean().default(true),
    expectedBedType: z.string().min(1).max(64).optional(),
    expectedFilamentDiameter: quantity({
      unit: 'mm',
      quantityKind: quantityKinds.diameter,
      space: 'linear',
    })
      .positive()
      .optional(),
    expectedMaterials: z
      .array(z.strictObject({ slot: traySlots(15), materialId: z.string().min(1).max(128) }))
      .max(16)
      .default([]),
    expectedModel: z.literal('X1C').optional(),
    expectedNozzleDiameter: quantity({ unit: 'mm', quantityKind: quantityKinds.diameter, space: 'linear' })
      .positive()
      .optional(),
    operatorConfirmedBedType: z.string().min(1).max(64).optional(),
    flowCalibration: z.boolean().default(true),
    timelapse: z.boolean().default(false),
  }),
  ui: { version: 1, rjsf: {} },
});

/** The A1 mini's submission schema: one AMS lite and its own model name. @internal */
export const bambuA1MiniSubmissionConfiguration = defineConfiguration({
  id: 'bambu.a1-mini.submission',
  version: '1.1.0',
  schema: bambuSubmissionConfiguration.schema.extend({
    expectedModel: z.literal('A1 mini').optional(),
    amsMapping: z.array(traySlots(3, -1)).max(4).default([]),
    expectedMaterials: z
      .array(z.strictObject({ slot: traySlots(3), materialId: z.string().min(1).max(128) }))
      .max(4)
      .default([]),
  }),
  ui: { version: 1, rjsf: {} },
});

const accepted: Extract<MachineManifestDefinition['jobs'], { type: 'supported' }>['accepts'] = [
  {
    contract: { id: 'manufacturing.toolpath.bambu-gcode-3mf', version: 1 },
    mediaType: 'application/vnd.bambulab.gcode-3mf',
    requiredMembers: ['Metadata/plate_1.gcode'],
    payloadSelection: 'plate',
    technology: 'additive.fff',
  },
];

/** The one container contract both printers accept. @internal */
export const bambuAcceptedContainers: readonly MachineAcceptedContainer[] = accepted;

/** The qualification profile of the controls proven on the workshop X1C. @internal */
export const bambuX1cHardwareProfile = 'x1c-hardware-2026-10';
const proven: MachineActionQualification = { status: 'qualified', profileId: bambuX1cHardwareProfile };
/** The profile of the controls the operator proved from the Print pane in Testing mode. @internal */
export const bambuX1cTestingProfile = 'x1c-testing-2026-10-05';
const provenInTesting: MachineActionQualification = { status: 'qualified', profileId: bambuX1cTestingProfile };
/** The profile of the A1 mini controls the operator proved from the Print pane in Testing mode. @internal */
export const bambuA1MiniTestingProfile = 'a1-mini-testing-2026-10-05';
const provenOnMini: MachineActionQualification = { status: 'qualified', profileId: bambuA1MiniTestingProfile };

const anyState: readonly MachineStatus[] = ['ready', 'active', 'held'];
const idle: readonly MachineStatus[] = ['ready'];
const material = [{ componentId: 'filament', group: 'material' }] as const;

/**
 * What stopping or cancelling does on a Bambu printer: motion halts, the heaters go off, the position is kept. The
 * printer is ready at once; only the part left on the plate stands in the way of the next print.
 */
const halts: MachineHaltOutcome = {
  motion: 'halts',
  spindle: 'none',
  heaters: 'off',
  position: 'kept',
  recovery: [{ type: 'person', instruction: 'Remove the unfinished print from the build plate.' }],
};

/**
 * A control on the host's low-risk list (a light, a printer's speed profile). The standard families start above the
 * `agent` floor, so the provider declares them directly with the family's own schema.
 */
const fanLevel = standardMachineActions['level.set'].schema.extend({
  ratio: quantity({ unit: '1' }).min(0).max(1).meta({ title: 'Speed', description: '0 is off, 1 is full speed.' }),
});

/** `motion.jog` parameters. @internal */
export const bambuJogSchema = z.strictObject({
  axis: z.enum(['x', 'y', 'z']).meta({ title: 'Axis' }),
  distance: z
    .number()
    .min(-10)
    .max(10)
    .meta({ title: 'Distance', description: 'Signed millimetres in the axis’s own direction, at most 10.' }),
  feed: quantity({ unit: 'mm/min' }).positive().max(3000).meta({ title: 'Feed' }),
});

/** A slot address parameter. @internal */
export const bambuSlotSchema = z.strictObject({
  unitId: z.string().min(1).max(64).meta({ title: 'Material unit' }),
  slotId: z.string().min(1).max(64).meta({ title: 'Slot' }),
});

/** `speed:option.set` parameters, in `print_speed` order. @internal */
export const bambuSpeedSchema = z.strictObject({
  option: z.enum(['silent', 'standard', 'sport', 'ludicrous']).meta({ title: 'Speed' }),
});

/** The printer routines `bambu.printer.calibrate` runs, per model (BL-P001.json, N1.json). */
const routines = {
  // eslint-disable-next-line @typescript-eslint/naming-convention -- keyed by the model name.
  X1C: ['lidar', 'bed-levelling', 'vibration'],
  'A1 mini': ['bed-levelling', 'vibration', 'motor-noise'],
} as const;

/** `bambu.printer.calibrate` parameters, per model. @internal */
export const bambuCalibrateSchemas = {
  // eslint-disable-next-line @typescript-eslint/naming-convention -- keyed by the model name.
  X1C: z.strictObject({ routines: z.array(z.enum(routines.X1C)).min(1).max(3).meta({ title: 'Routines' }) }),
  'A1 mini': z.strictObject({
    routines: z.array(z.enum(routines['A1 mini'])).min(1).max(3).meta({ title: 'Routines' }),
  }),
} as const;

/**
 * Bambu calibration belongs to a person who need not stand at the printer (2026-10-05 amendment): the plate must be
 * empty and a run prints or purges, so an agent may not start or change one.
 */
const calibrationSafety = { authority: 'person', attended: false, interlocks: [] } as const;

const fanLabels = { 'part-fan': 'Part fan', 'aux-fan': 'Auxiliary fan', 'chamber-fan': 'Chamber fan' } as const;

const actions = (model: 'X1C' | 'A1 mini'): readonly MachineActionDefinition[] => {
  const x1c = model === 'X1C';
  const runQualification = x1c ? { qualification: proven } : {};
  return [
    ...(x1c
      ? [
          standardMachineAction({
            componentId: 'chamber-light',
            componentKind: 'light',
            id: 'switch.set',
            label: 'Chamber light',
            when: anyState,
            effects: ['illumination'],
            schema: standardMachineActions['switch.set'].schema,
            qualification: provenInTesting,
          }),
        ]
      : []),
    standardMachineAction({
      componentId: 'speed',
      componentKind: 'speed-profile',
      id: 'option.set',
      label: 'Print speed',
      when: ['active', 'held'],
      effects: ['motion'],
      schema: bambuSpeedSchema,
    }),
    standardMachineAction({
      id: 'run.pause',
      componentId: 'controller',
      label: 'Pause',
      when: ['active'],
      consequence: 'The toolhead parks and the nozzle stays hot.',
      outcome: {
        motion: 'decelerates',
        spindle: 'none',
        heaters: 'unchanged',
        position: 'kept',
        recovery: [{ type: 'action', componentId: 'controller', action: 'run.resume' }],
      },
      ...runQualification,
    }),
    standardMachineAction({
      id: 'run.resume',
      componentId: 'controller',
      label: 'Resume',
      when: ['held'],
      ...runQualification,
    }),
    standardMachineAction({
      id: 'run.cancel',
      componentId: 'controller',
      label: 'Cancel print',
      when: ['active', 'held'],
      consequence: 'The print ends and cannot be continued.',
      outcome: halts,
      ...runQualification,
    }),
    ...(x1c ? (['part-fan', 'aux-fan', 'chamber-fan'] as const) : (['part-fan'] as const)).map((componentId) =>
      standardMachineAction({
        id: 'level.set',
        componentId,
        label: fanLabels[componentId],
        when: anyState,
        effects: ['thermal'],
        schema: fanLevel,
        qualification: x1c ? provenInTesting : provenOnMini,
      }),
    ),
    standardMachineAction({
      id: 'material.load',
      componentId: 'filament',
      label: 'Load filament',
      when: idle,
      requires: material,
      consequence: 'The printer heats the nozzle, cuts any loaded filament and feeds the new one through.',
    }),
    standardMachineAction({
      id: 'material.unload',
      componentId: 'filament',
      label: 'Unload filament',
      when: idle,
      requires: material,
      consequence: 'The printer heats the nozzle, cuts the filament and pulls it back.',
    }),
    standardMachineAction({
      id: 'material.set',
      componentId: 'filament',
      label: 'Set material',
      when: anyState,
      requires: material,
    }),
    standardMachineAction({
      id: 'material.clear',
      componentId: 'filament',
      label: 'Clear material',
      when: anyState,
      requires: material,
    }),
    standardMachineAction({
      id: 'material.calibration.select',
      componentId: 'filament',
      label: 'Use a pressure-advance profile',
      description: 'Choose `default` for the printer’s own pressure advance.',
      when: idle,
      requires: material,
      safety: calibrationSafety,
    }),
    standardMachineAction({
      id: 'material.calibration.save',
      componentId: 'filament',
      label: 'Save a pressure-advance profile',
      when: idle,
      requires: material,
      safety: calibrationSafety,
    }),
    standardMachineAction({
      id: 'material.calibration.delete',
      componentId: 'filament',
      label: 'Delete a pressure-advance profile',
      when: idle,
      requires: material,
      safety: calibrationSafety,
    }),
    standardMachineAction({
      id: 'material.calibration.run',
      componentId: 'filament',
      label: 'Calibrate',
      when: idle,
      requires: material,
      safety: calibrationSafety,
      consequence: x1c
        ? 'The printer heats, prints test lines on the plate and scans them.'
        : 'The printer heats and purges filament at the wiper to measure it.',
      ...(x1c
        ? {}
        : {
            // Flow ratio is measured automatically only by the X1 series' lidar.
            schema: standardMachineActions['material.calibration.run'].schema.extend({
              method: z.enum(['pressure-advance']).meta({ title: 'What to measure' }),
            }),
          }),
    }),
    standardMachineAction({
      id: 'interaction.respond',
      componentId: 'filament',
      label: 'Answer the filament check',
      when: anyState,
      effects: ['material', 'motion', 'thermal'],
    }),
    defineMachineAction(
      {
        componentId: 'filament',
        id: 'bambu.ams.read-tag',
        version: 1,
        label: 'Read spool tag',
        effects: ['observe', 'material', 'motion'],
        scope: 'idle',
        when: idle,
        safety: { authority: 'approved-agent', attended: false, interlocks: [] },
        requires: material,
        consequence: 'The AMS turns the spool past its tag reader.',
        confirms: 'observation',
      },
      bambuSlotSchema,
    ),
    defineMachineAction(
      {
        componentId: 'filament',
        id: 'bambu.filament.abort',
        version: 1,
        label: 'Stop the filament change',
        effects: ['material', 'motion'],
        scope: 'any',
        when: anyState,
        safety: { authority: 'approved-agent', attended: false, interlocks: [] },
        requires: [],
        confirms: 'observation',
      },
      z.strictObject({}),
    ),
    standardMachineAction({
      id: 'motion.home',
      componentId: 'motion',
      label: 'Home axes',
      when: idle,
      consequence: 'The toolhead and the bed move to their end stops.',
      confirms: 'acknowledgement',
      schema: z.strictObject({}),
      ...(x1c ? { qualification: provenInTesting } : {}),
    }),
    standardMachineAction({
      id: 'motion.jog',
      componentId: 'motion',
      label: 'Move an axis',
      when: idle,
      consequence: 'One relative move inside the printer’s soft limits.',
      confirms: 'acknowledgement',
      schema: bambuJogSchema,
      qualification: x1c ? provenInTesting : provenOnMini,
    }),
    defineMachineAction(
      {
        componentId: 'controller',
        id: 'bambu.printer.calibrate',
        version: 1,
        label: 'Run printer calibration',
        effects: ['motion', 'thermal'],
        scope: 'idle',
        when: idle,
        safety: calibrationSafety,
        requires: [],
        consequence: 'The printer homes, probes the bed and sweeps its motors; the plate must be empty.',
        confirms: 'observation',
      },
      bambuCalibrateSchemas[model],
    ),
  ];
};

const fffProcess = (model: 'X1C' | 'A1 mini') =>
  model === 'X1C'
    ? ({
        type: 'fff',
        version: 1,
        geometry: {
          unit: 'mm',
          buildVolume: { x: 256, y: 256, z: 256 },
          enclosure: { outer: { x: 389, y: 389, z: 457 }, enclosed: true, doors: ['front', 'top'] },
          kinematics: 'corexy',
          bedMotion: 'z',
          origin: 'front-left',
          toolheadHome: { x: 1, y: 1, z: 256 },
          materialSystemMount: 'top',
        },
        filamentDiameter: millimetres(1.75),
        bed: {
          maximumTemperature: celsius(120),
          plates: [
            { id: 'cool', label: 'Cool plate' },
            { id: 'engineering', label: 'Engineering plate' },
            { id: 'high-temperature', label: 'High temperature plate' },
            { id: 'textured-pei', label: 'Textured PEI plate' },
          ],
        },
        chamber: { enclosed: true, heated: false },
        speedProfiles,
        slicing: {
          recommended: {
            layerHeight: millimetres(0.2),
            walls: 2,
            infillPercent: 15,
            nozzleTemperature: celsius(250),
            bedTemperature: celsius(70),
          },
          presets,
        },
      } as const)
    : ({
        type: 'fff',
        version: 1,
        geometry: {
          unit: 'mm',
          buildVolume: { x: 180, y: 180, z: 180 },
          enclosure: { outer: { x: 347, y: 315, z: 365 }, enclosed: false, doors: [] },
          kinematics: 'cartesian-bedslinger',
          bedMotion: 'y',
          origin: 'front-left',
          toolheadHome: { x: 1, y: 1, z: 180 },
          materialSystemMount: 'external',
        },
        filamentDiameter: millimetres(1.75),
        bed: {
          maximumTemperature: celsius(80),
          plates: [
            { id: 'high-temperature', label: 'Smooth PEI plate' },
            { id: 'textured-pei', label: 'Textured PEI plate' },
          ],
        },
        chamber: { enclosed: false, heated: false },
        speedProfiles,
        slicing: {
          recommended: {
            layerHeight: millimetres(0.2),
            walls: 2,
            infillPercent: 15,
            nozzleTemperature: celsius(215),
            bedTemperature: celsius(60),
          },
          presets,
        },
      } as const);

const speedProfiles = [
  { id: 'silent', label: 'Silent', percent: 50 },
  { id: 'standard', label: 'Standard', percent: 100 },
  { id: 'sport', label: 'Sport', percent: 124 },
  { id: 'ludicrous', label: 'Ludicrous', percent: 166 },
];
const presets = [
  { id: 'fast', label: 'Fast', layerHeight: millimetres(0.28) },
  { id: 'standard', label: 'Standard', layerHeight: millimetres(0.2) },
  { id: 'fine', label: 'Fine', layerHeight: millimetres(0.12) },
] as const;

type MaterialUnit = Extract<MachineComponent, { kind: 'material-system' }>['units'][number];

/**
 * The material-system unit of one AMS, by its index.
 * @param index - The AMS index the printer reports, 0–3.
 * @returns The unit.
 * @throws RangeError for an index no single-nozzle Bambu printer has; the protocol never reports one.
 * @internal
 */
export const bambuAmsUnit = (index: number): MaterialUnit => {
  const letter = Number.isInteger(index) ? 'abcd'[index] : undefined;
  if (letter === undefined) {
    throw new RangeError(`AMS ${String(index)} does not exist.`);
  }
  return {
    id: `ams-${letter}`,
    label: `AMS ${letter.toUpperCase()}`,
    kind: 'feeder',
    slots: [1, 2, 3, 4].map((tray) => ({
      id: `${letter}${String(tray)}`,
      label: `${letter.toUpperCase()}${String(tray)}`,
    })),
  };
};

/** The external spool holder unit. @internal */
export const bambuExternalUnit: MaterialUnit = {
  id: 'external',
  label: 'External spool',
  kind: 'external',
  slots: [{ id: 'spool', label: 'External spool' }],
};

/** The toolhead nozzle a manifest declares, from what the printer reports. @internal */
export const bambuNozzle = (diameter: number, hardened: boolean) =>
  ({
    id: `nozzle-${String(diameter)}`,
    diameter: millimetres(diameter),
    maximumTemperature: celsius(300),
    material: hardened ? 'hardened' : 'stainless',
  }) as const;

const definition = (model: 'X1C' | 'A1 mini'): MachineManifestDefinition => {
  const x1c = model === 'X1C';
  const travel = x1c ? 256 : 180;
  return {
    version: 3,
    identity: x1c
      ? { typeId: 'bambu.x1c', vendor: 'Bambu Lab', model: 'x1c', displayName: 'X1 Carbon', family: 'X1' }
      : { typeId: 'bambu.a1-mini', vendor: 'Bambu Lab', model: 'a1-mini', displayName: 'A1 mini', family: 'A1' },
    connection: {
      transport: 'network',
      exclusive: false,
      opening: 'nothing',
      identity: 'authenticated',
      // The binding pins these under the ids the host reads (`serviceTrust['mqtt' | 'camera']`). Uploads (FTPS 990)
      // reuse the MQTT pin, so no ftp service: declaring one would add a probe. Simulated bindings pin nothing.
      services: [
        { id: 'mqtt', port: 8883, required: true },
        { id: 'camera', port: x1c ? 322 : 6000, required: false },
      ],
    },
    axes: (['x', 'y', 'z'] as const).map((id) => ({
      id,
      label: id.toUpperCase(),
      kind: 'linear',
      unit: 'mm',
      travel: { min: 0, max: travel },
      // The X1C's bed rides Z; the A1 mini's bed rides Y.
      carries: (x1c ? id === 'z' : id === 'y') ? 'work' : 'tool',
      reference: 'cycle',
    })),
    components: [
      { id: 'controller', kind: 'controller', label: 'Printer' },
      ...(x1c ? [{ id: 'chamber-light', kind: 'light', label: 'Chamber light' } as const] : []),
      { id: 'speed', kind: 'speed-profile', label: 'Print speed' },
      { id: 'motion', kind: 'motion', label: 'Axes', axes: ['x', 'y', 'z'] },
      { id: 'tool-0', kind: 'toolhead', label: 'Toolhead', nozzles: [bambuNozzle(0.4, x1c)] },
      { id: 'bed', kind: 'heater', label: 'Bed' },
      ...(x1c ? [{ id: 'chamber', kind: 'enclosure', label: 'Chamber' } as const] : []),
      { id: 'part-fan', kind: 'fan', label: 'Part fan', parentId: 'tool-0' },
      ...(x1c
        ? ([
            { id: 'aux-fan', kind: 'fan', label: 'Auxiliary fan' },
            { id: 'chamber-fan', kind: 'fan', label: 'Chamber fan' },
          ] as const)
        : []),
      { id: 'camera', kind: 'camera', label: x1c ? 'Chamber camera' : 'Camera' },
      {
        id: 'filament',
        kind: 'material-system',
        label: x1c ? 'AMS and external spool' : 'AMS lite and external spool',
        // The X1C takes up to four AMS units, the A1 mini one AMS lite; a connected printer reports the ones it has.
        units: [...(x1c ? [0, 1, 2, 3] : [0]).map((index) => bambuAmsUnit(index)), bambuExternalUnit],
        routes: [...(x1c ? ['ams-a', 'ams-b', 'ams-c', 'ams-d'] : ['ams-a']), 'external'].map((unitId) => ({
          unitId,
          toolheadIds: ['tool-0'],
        })),
      },
    ],
    processes: [fffProcess(model)],
    actions: actions(model),
    holds: [],
    jobs: {
      type: 'supported',
      accepts: accepted,
      delivery: 'stored',
      start: 'remote',
      attestations: [{ id: 'work-area-clear', label: 'The build plate is clear' }],
      safety: { authority: 'approved-agent', attended: false, interlocks: [] },
    },
    stop: halts,
    observations: [
      { group: 'state', label: 'Printer state', staleAfter: seconds(30), delivery: 'retained' },
      { group: 'temperature', label: 'Temperatures', staleAfter: seconds(30), delivery: 'retained' },
      { group: 'accessories', label: 'Light, fans and speed', staleAfter: seconds(60), delivery: 'retained' },
      { group: 'material', label: 'Filament', staleAfter: seconds(90), delivery: 'retained' },
      { group: 'position', label: 'Axes', staleAfter: seconds(60), delivery: 'retained' },
    ],
    qualifications: x1c
      ? [
          {
            id: bambuX1cHardwareProfile,
            environment: 'hardware',
            model: 'X1C',
            firmware: ['01.12.00.00'],
            attachments: ['filament', 'camera'],
            evidence:
              'qualify-x1c print-cube runs on the workshop X1C at firmware 01.12.00.00 with Developer Mode on (2026-09-15, agentic-manufacturing runway br10-print-attempt; machines production readiness program): start, pause, resume, cancel, stop and camera still.',
          },
          {
            id: bambuX1cTestingProfile,
            environment: 'hardware',
            model: 'X1C',
            firmware: ['01.12.00.00'],
            attachments: ['filament', 'camera'],
            evidence:
              'The operator switched the chamber light, homed and jogged X, Y and Z, and set the part, auxiliary and chamber fans on the workshop X1C at firmware 01.12.00.00 from the Print pane in Testing mode (2026-10-05).',
          },
        ]
      : [
          {
            id: bambuA1MiniTestingProfile,
            environment: 'hardware',
            model: 'A1 mini',
            firmware: ['01.03.30.01'],
            attachments: ['camera'],
            evidence:
              'The operator set the part fan and jogged X, Y and Z on the workshop A1 mini (no AMS lite) at firmware 01.03.30.01 from the Print pane in Testing mode (2026-10-05).',
          },
        ],
  };
};

/** The X1C manifest with its trusted action schemas, as the provider authors it. @internal */
export const bambuX1cDefinition: MachineManifestDefinition = definition('X1C');
/** The A1 mini manifest with its trusted action schemas. @internal */
export const bambuA1MiniDefinition: MachineManifestDefinition = definition('A1 mini');

/**
 * The same manifest as a simulator declares it: every action it implements qualified by the `simulation` profile.
 * Simulation never qualifies hardware; the profile names the simulator.
 * @param manifest - The hardware definition.
 * @param model - The model the simulator plays.
 * @returns The simulator's definition.
 * @internal
 */
export const bambuSimulatedDefinition = (
  manifest: MachineManifestDefinition,
  model: 'X1C' | 'A1 mini',
): MachineManifestDefinition => ({
  ...manifest,
  identity: { ...manifest.identity, displayName: `Simulated ${model}` },
  actions: manifest.actions.map((action) => Object.freeze({ ...action, qualification: simulated })),
  qualifications: [
    {
      id: 'simulation',
      environment: 'simulation',
      model,
      firmware: ['simulator-2'],
      attachments: ['filament', 'camera'],
      evidence: 'packages/plugins/bambu/src/bambu.simulator.test.ts drives every action through the Bambu session.',
    },
  ],
});
const simulated: MachineActionQualification = { status: 'qualified', profileId: 'simulation' };

/**
 * Bambu Lab X1 Carbon manifest (version 3): hardware, the FFF process, declared actions and jobs. Pause, resume and
 * cancel are qualified by the print-cube runs (`x1c-hardware-2026-10`); the chamber light, the three fans, homing and
 * jogging by the operator's Testing-mode session (`x1c-testing-2026-10-05`); everything else is `designed` until the
 * testing program proves it. A connected printer whose firmware is outside a profile's list reports those actions
 * `designed`.
 * @public
 */
export const bambuX1cManifest: MachineManifest = machineManifestOf(
  bambuX1cDefinition,
  bambuSubmissionConfiguration.manifest,
);

/**
 * Bambu Lab A1 mini manifest (version 3). The part fan and jogging are qualified by the operator's Testing-mode
 * session (`a1-mini-testing-2026-10-05`, no AMS lite attached); everything else is `designed`.
 * @public
 */
export const bambuA1MiniManifest: MachineManifest = machineManifestOf(
  bambuA1MiniDefinition,
  bambuA1MiniSubmissionConfiguration.manifest,
);
