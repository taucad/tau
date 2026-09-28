import { parseMachineManifest } from '@taucad/runtime/machine';
import type { MachineManifest } from '@taucad/runtime/machine';

const millimetres = (value: number) => ({ value, unit: 'mm' });
const celsius = (value: number) => ({ value, unit: 'Cel' });
const seconds = (value: number): number => value * 1000;

/**
 * Bambu Lab X1 Carbon manifest: the physical facts the printer viewer, Print pane,
 * controls and freshness badges derive from (blueprint D7, R3). Actions marked
 * `qualified` are the ones the runway exercised on hardware; `designed` and
 * `unsupported` actions stay disabled with the descriptor as the reason.
 * @public
 */
export const bambuX1cManifest: MachineManifest = parseMachineManifest({
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
  materialSystem: { units: 1, slotsPerUnit: 4, externalSpool: true, externalSpoolSlot: 254, drying: true },
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
    { group: 'thermal', label: 'Temperatures', staleAfter: seconds(15) },
    { group: 'run', label: 'Run', staleAfter: seconds(15) },
    { group: 'material', label: 'Material system', staleAfter: seconds(60) },
    { group: 'fans', label: 'Fans', staleAfter: seconds(15) },
    { group: 'light', label: 'Chamber light', staleAfter: seconds(60) },
    { group: 'network', label: 'Network', staleAfter: seconds(60) },
    { group: 'storage', label: 'Removable storage', staleAfter: seconds(120) },
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
