/**
 * Fixtures for the machine details and Machines settings tests: the Bambu Lab
 * X1C manifest and configurations exactly as the `bambu` and `bambu-simulator`
 * providers declare them (`packages/plugins/bambu/src/bambu.manifest.ts`,
 * `bambu.machine.ts`, `bambu.simulator.ts`), admitted through the same
 * `parseMachineProvider` the machines channel applies to `listProviders()`.
 * `apps/ui` does not depend on `@taucad/bambu`, so the facts are mirrored here.
 * Nothing here touches hardware.
 *
 * @module
 */

import { z } from 'zod';
import { defineConfiguration } from '@taucad/runtime/configuration';
import { quantity } from '@taucad/runtime/configuration/zod';
import { parseMachineManifest, parseMachineProvider } from '@taucad/runtime/machine';
import type { MachineDirectoryEntry, MachineManifest, MachineProvider } from '@taucad/runtime/machine';
import { quantityKinds } from '@taucad/units/quantity';

const millimetres = (value: number) => ({ value, unit: 'mm' });
const celsius = (value: number) => ({ value, unit: 'Cel' });

/** The X1 Carbon manifest, value for value. */
export const x1cManifest: MachineManifest = parseMachineManifest({
  version: 1,
  identity: {
    vendor: 'Bambu Lab',
    model: 'x1c',
    displayName: 'X1 Carbon',
    family: 'X1',
    qualifiedFirmware: ['01.08.02.00'],
  },
  technology: 'additive.fff',
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
  toolhead: {
    filamentDiameter: millimetres(1.75),
    nozzles: [{ id: 'nozzle-0.4', diameter: millimetres(0.4), maximumTemperature: celsius(300), material: 'hardened' }],
  },
  bed: {
    maximumTemperature: celsius(120),
    plates: [
      { id: 'cool', label: 'Cool plate' },
      { id: 'engineering', label: 'Engineering plate' },
      { id: 'high-temperature', label: 'High temperature plate' },
      { id: 'textured-pei', label: 'Textured PEI plate' },
    ],
  },
  chamber: {
    enclosed: true,
    heated: false,
    light: true,
    fans: [
      { id: 'part', label: 'Part cooling fan' },
      { id: 'auxiliary', label: 'Auxiliary fan' },
      { id: 'chamber', label: 'Chamber fan' },
    ],
  },
  materialSystem: { units: 1, slotsPerUnit: 4, externalSpool: true, drying: true },
  camera: { stills: true },
  storage: { removable: true },
  network: { lanMode: true, cloud: false },
  speedProfiles: [
    { id: 'silent', label: 'Silent', percent: 50 },
    { id: 'standard', label: 'Standard', percent: 100 },
    { id: 'sport', label: 'Sport', percent: 124 },
    { id: 'ludicrous', label: 'Ludicrous', percent: 166 },
  ],
  actions: [
    {
      id: 'print.start',
      label: 'Start print',
      effect: 'print',
      qualification: 'qualified',
      preconditions: ['Approved print request', 'Idle machine', 'Setup unchanged since preparation'],
    },
    {
      id: 'run.pause',
      label: 'Pause',
      effect: 'print',
      qualification: 'qualified',
      preconditions: ['Exact observed run'],
    },
    {
      id: 'run.resume',
      label: 'Resume',
      effect: 'print',
      qualification: 'qualified',
      preconditions: ['Exact observed run'],
    },
    {
      id: 'run.cancel',
      label: 'Cancel',
      effect: 'print',
      qualification: 'qualified',
      preconditions: ['Exact observed run'],
    },
    {
      id: 'run.urgent-stop',
      label: 'Urgent stop',
      description: 'Priority stop of the current run; not a certified emergency stop.',
      effect: 'print',
      qualification: 'qualified',
    },
    {
      id: 'camera.still',
      label: 'Capture still',
      effect: 'observe',
      qualification: 'qualified',
      preconditions: ['Pinned camera trust'],
    },
    {
      id: 'light.set',
      label: 'Chamber light',
      effect: 'none',
      qualification: 'designed',
      parameters: { type: 'object', properties: { on: { type: 'boolean' } }, required: ['on'] },
    },
    {
      id: 'speed.set',
      label: 'Speed profile',
      effect: 'motion',
      qualification: 'designed',
      parameters: {
        type: 'object',
        properties: { profile: { type: 'string', enum: ['silent', 'standard', 'sport', 'ludicrous'] } },
        required: ['profile'],
      },
    },
    {
      id: 'fan.set',
      label: 'Fan target',
      effect: 'thermal',
      qualification: 'designed',
      parameters: {
        type: 'object',
        properties: {
          fan: { type: 'string', enum: ['part', 'auxiliary', 'chamber'] },
          percent: { type: 'integer', minimum: 0, maximum: 100 },
        },
        required: ['fan', 'percent'],
      },
    },
    {
      id: 'temperature.set',
      label: 'Heater target',
      effect: 'thermal',
      qualification: 'designed',
      parameters: {
        type: 'object',
        properties: {
          heater: { type: 'string', enum: ['nozzle', 'bed'] },
          target: { type: 'number', minimum: 0, maximum: 300 },
        },
        required: ['heater', 'target'],
      },
    },
    {
      id: 'motion.home',
      label: 'Home axes',
      effect: 'motion',
      qualification: 'designed',
      preconditions: ['No active run', 'Doors closed'],
    },
    {
      id: 'motion.jog',
      label: 'Jog axis',
      effect: 'motion',
      qualification: 'designed',
      parameters: {
        type: 'object',
        properties: {
          axis: { type: 'string', enum: ['x', 'y', 'z'] },
          distance: { type: 'number', minimum: -10, maximum: 10 },
        },
        required: ['axis', 'distance'],
      },
      preconditions: ['No active run', 'Homed axes'],
    },
    {
      id: 'material.load',
      label: 'Load filament',
      effect: 'material',
      qualification: 'designed',
      parameters: {
        type: 'object',
        properties: { slot: { type: 'integer', minimum: 0, maximum: 3 } },
        required: ['slot'],
      },
      preconditions: ['Nozzle at material temperature'],
    },
    {
      id: 'material.unload',
      label: 'Unload filament',
      effect: 'material',
      qualification: 'designed',
      preconditions: ['Nozzle at material temperature'],
    },
    {
      id: 'calibration.run',
      label: 'Run calibration',
      effect: 'motion',
      qualification: 'unsupported',
      description: 'Named qualified procedures need their own charter slice.',
    },
    {
      id: 'storage.format',
      label: 'Format storage',
      effect: 'storage',
      qualification: 'unsupported',
      description: 'Destructive storage actions are outside this authority.',
    },
  ],
  observations: [
    { group: 'thermal', label: 'Temperatures', staleAfter: 15_000 },
    { group: 'run', label: 'Run', staleAfter: 15_000 },
    { group: 'material', label: 'Material system', staleAfter: 60_000 },
    { group: 'fans', label: 'Fans', staleAfter: 15_000 },
    { group: 'light', label: 'Chamber light', staleAfter: 60_000 },
    { group: 'network', label: 'Network', staleAfter: 60_000 },
    { group: 'storage', label: 'Removable storage', staleAfter: 120_000 },
  ],
  slicing: {
    recommended: {
      layerHeight: millimetres(0.2),
      walls: 2,
      infillPercent: 15,
      nozzleTemperature: celsius(250),
      bedTemperature: celsius(70),
    },
    presets: [
      { id: 'fast', label: 'Fast', layerHeight: millimetres(0.28) },
      { id: 'standard', label: 'Standard', layerHeight: millimetres(0.2) },
      { id: 'fine', label: 'Fine', layerHeight: millimetres(0.12) },
    ],
  },
});

const bindingConfiguration = defineConfiguration({
  id: 'bambu.machine.binding',
  version: '1.0.0',
  schema: z.object({
    logicalId: z.string().min(1).max(64),
    address: z.string().min(1).max(253).optional(),
    serial: z.string().min(1).max(64).optional(),
  }),
  ui: { version: 1, rjsf: {} },
});

const simulatorBindingConfiguration = defineConfiguration({
  id: 'bambu.simulator.binding',
  version: '1.1.0',
  schema: z.object({
    logicalId: z.string().min(1).max(64),
    speed: z.number().min(1).max(3600).default(1).meta({
      title: 'Demo speed',
      description: 'Simulated seconds per real second, so a long print can be watched in minutes',
    }),
  }),
  ui: { version: 1, rjsf: {} },
});

const submissionConfiguration = defineConfiguration({
  id: 'bambu.machine.submission',
  version: '1.1.0',
  schema: z.object({
    amsMapping: z.array(z.number().int().min(-1).max(15)).max(16).default([]),
    bedLeveling: z.boolean().default(true),
    expectedBedType: z.string().min(1).max(64),
    expectedFilamentDiameter: quantity({
      unit: 'mm',
      quantityKind: quantityKinds.diameter,
      space: 'linear',
    }).positive(),
    expectedMaterials: z
      .array(z.strictObject({ slot: z.number().int().min(0).max(15), materialId: z.string().min(1).max(128) }))
      .min(1)
      .max(16),
    expectedModel: z.literal('X1C'),
    expectedNozzleDiameter: quantity({ unit: 'mm', quantityKind: quantityKinds.diameter, space: 'linear' }).positive(),
    operatorConfirmedBedType: z.string().min(1).max(64).optional(),
    flowCalibration: z.boolean().default(true),
    timelapse: z.boolean().default(false),
  }),
  ui: { version: 1, rjsf: {} },
});

const accepts = [
  {
    contract: { id: 'manufacturing.toolpath.bambu-gcode-3mf', version: 1 },
    mediaType: 'application/vnd.bambulab.gcode-3mf',
    requiredMembers: ['Metadata/plate_1.gcode'],
    payloadSelection: 'plate',
    technology: 'additive.fff',
  },
];

/** The `bambu` LAN provider as `listProviders()` returns it. */
export const x1cProvider: MachineProvider = parseMachineProvider({
  id: 'bambu',
  name: 'Bambu Lab Developer LAN',
  version: '1.0.0',
  protocolVersion: 1,
  vendor: 'Bambu Lab',
  technologies: ['additive.fff'],
  accepts,
  manifest: x1cManifest,
  bindingConfiguration: bindingConfiguration.manifest,
  submissionConfiguration: submissionConfiguration.manifest,
  queries: {},
});

/** The labeled `bambu-simulator` provider: the same manifest under its own display name. */
export const simulatorProvider: MachineProvider = parseMachineProvider({
  id: 'bambu-simulator',
  name: 'Simulated X1C',
  version: '1.0.0',
  protocolVersion: 1,
  vendor: 'Bambu Lab',
  technologies: ['additive.fff'],
  accepts,
  manifest: { ...x1cManifest, identity: { ...x1cManifest.identity, displayName: 'Simulated X1C' } },
  bindingConfiguration: simulatorBindingConfiguration.manifest,
  submissionConfiguration: submissionConfiguration.manifest,
  queries: {},
});

/**
 * One bound machine as the directory lists it.
 *
 * @param input - The machine id, the provider, the name the person gave it and what it reports about itself.
 * @returns A directory entry.
 */
export const boundEntry = ({
  machineId,
  providerId,
  name,
  firmware,
}: Readonly<{ machineId: string; providerId: string; name: string; firmware: string }>): MachineDirectoryEntry => ({
  machineId,
  name,
  providerId,
  freshness: 'current',
  descriptor: {
    id: `serial-${machineId}`,
    /* What the printer reports about itself; the list shows the name the person gave it (blueprint D3). */
    name: `X1C-${machineId}`,
    vendor: 'Bambu Lab',
    model: 'X1C',
    technology: 'additive.fff',
    firmware,
    accepts: x1cProvider.accepts,
    operations: ['prepare', 'upload', 'submit', 'pause', 'resume', 'cancel', 'urgent-stop', 'still'],
    ratedEnvelope: { width: 0.256, depth: 0.256, height: 0.256, unit: 'm' },
    printableEnvelope: { width: 0.256, depth: 0.256, height: 0.256, unit: 'm' },
    tools: [{ id: 'nozzle-0.4', kind: 'extruder' }],
    materialSystem: { kind: 'ams', slotCount: 4 },
    bedTypes: ['cool', 'engineering', 'high-temperature', 'textured-pei'],
  },
  snapshot: {
    connection: 'connected',
    readiness: 'idle',
    observedAt: '2026-09-24T08:00:00.000Z',
    setup: { materials: [] },
  },
});

/** The simulated X1C the settings card's "Add simulated X1C" binds. */
export const simulatedEntry = boundEntry({
  machineId: 'simulated-x1c',
  providerId: 'bambu-simulator',
  name: 'Simulated X1C',
  firmware: 'simulator-1',
});

/** A real X1C on the LAN, on qualified firmware. */
export const workshopEntry = boundEntry({
  machineId: 'workshop-x1c',
  providerId: 'bambu',
  name: 'Workshop X1C',
  firmware: '01.08.02.00',
});
