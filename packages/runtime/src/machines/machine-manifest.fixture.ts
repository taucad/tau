import { parseMachineManifest } from '#machines/machine-manifest.js';

/** Smallest manifest the schema admits; shared by runtime machine fixtures. @internal */
export const machineManifestFixture = parseMachineManifest({
  version: 2,
  identity: {
    typeId: 'fixture.fff',
    vendor: 'fixture',
    model: 'fixture-printer',
    displayName: 'Fixture printer',
    qualifiedFirmware: [],
  },
  technology: 'additive.fff',
  geometry: {
    unit: 'mm',
    buildVolume: { x: 200, y: 200, z: 200 },
    enclosure: { outer: { x: 300, y: 300, z: 400 }, enclosed: false, doors: [] },
    kinematics: 'cartesian-bedslinger',
    bedMotion: 'y',
    origin: 'front-left',
    toolheadHome: { x: 1, y: 1, z: 200 },
    materialSystemMount: 'none',
  },
  toolhead: {
    filamentDiameter: { value: 1.75, unit: 'mm' },
    nozzles: [
      {
        id: 'nozzle-0.4',
        diameter: { value: 0.4, unit: 'mm' },
        maximumTemperature: { value: 260, unit: 'Cel' },
        material: 'stainless',
      },
    ],
  },
  bed: { maximumTemperature: { value: 100, unit: 'Cel' }, plates: [{ id: 'smooth', label: 'Smooth plate' }] },
  chamber: { enclosed: false, heated: false, light: false, fans: [] },
  materialSystem: { units: 0, slotsPerUnit: 0, externalSpool: true, externalSpoolSlot: 254, drying: false },
  camera: { stills: false },
  storage: { removable: false },
  network: { lanMode: true, cloud: false },
  speedProfiles: [],
  actions: [],
  observations: [],
  slicing: {
    recommended: {
      layerHeight: { value: 0.2, unit: 'mm' },
      walls: 2,
      infillPercent: 15,
      nozzleTemperature: { value: 210, unit: 'Cel' },
      bedTemperature: { value: 60, unit: 'Cel' },
    },
    presets: [
      { id: 'fast', label: 'Fast', layerHeight: { value: 0.28, unit: 'mm' } },
      { id: 'standard', label: 'Standard', layerHeight: { value: 0.2, unit: 'mm' } },
      { id: 'fine', label: 'Fine', layerHeight: { value: 0.12, unit: 'mm' } },
    ],
  },
});
