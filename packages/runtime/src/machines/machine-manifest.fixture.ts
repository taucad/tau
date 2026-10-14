import { z } from 'zod';

import { defineConfiguration } from '#configuration/configuration.js';
import { machineJogHold, standardMachineAction } from '#machines/machine-actions.js';
import { machineManifestOf } from '#machines/machine.js';
import type { MachineManifestDefinition } from '#machines/machine.js';

const qualified = { status: 'qualified', profileId: 'fixture-simulation' } as const;

/** The fixture's start form: only the slot a provider may map the program's material to. @internal */
export const machineSubmissionFixture = defineConfiguration({
  id: 'fixture.submission',
  version: '1',
  schema: z.strictObject({ slot: z.string().optional() }),
  ui: { version: 1, rjsf: {} },
});

/**
 * A small FFF printer every runtime machine test shares: a light an agent may switch unattended, a run it may pause,
 * a home that is still `designed`, a held jog, and stored jobs that need the plate cleared.
 * @internal
 */
export const machineManifestDefinitionFixture: MachineManifestDefinition = {
  version: 3,
  identity: { typeId: 'fixture.fff', vendor: 'fixture', model: 'fixture-printer', displayName: 'Fixture printer' },
  connection: { transport: 'network', exclusive: false, opening: 'nothing', identity: 'authenticated' },
  axes: (['x', 'y', 'z'] as const).map((id) => ({
    id,
    label: id.toUpperCase(),
    kind: 'linear',
    unit: 'mm',
    travel: { min: 0, max: 200 },
    carries: 'tool',
    reference: 'cycle',
  })),
  components: [
    { id: 'controller', label: 'Controller', kind: 'controller' },
    { id: 'chamber-light', label: 'Chamber light', kind: 'light' },
    { id: 'motion', label: 'Motion', kind: 'motion', axes: ['x', 'y', 'z'] },
  ],
  processes: [
    {
      type: 'fff',
      version: 1,
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
      filamentDiameter: { value: 1.75, unit: 'mm' },
      bed: { maximumTemperature: { value: 100, unit: 'Cel' }, plates: [{ id: 'smooth', label: 'Smooth plate' }] },
      chamber: { enclosed: false, heated: false },
      speedProfiles: [],
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
    },
  ],
  actions: [
    {
      // The host's low-risk list admits a light an agent switches unattended only on an `agent` floor.
      ...standardMachineAction({
        id: 'switch.set',
        componentId: 'chamber-light',
        label: 'Chamber light',
        when: ['ready', 'active', 'held'],
        requires: [{ componentId: 'chamber-light', group: 'accessories' }],
        qualification: qualified,
      }),
      safety: { authority: 'agent', attended: false, interlocks: [] },
    },
    standardMachineAction({
      id: 'run.pause',
      componentId: 'controller',
      label: 'Pause',
      when: ['active'],
      qualification: qualified,
      outcome: { motion: 'halts', spindle: 'none', heaters: 'unchanged', position: 'kept', recovery: [] },
    }),
    standardMachineAction({
      id: 'run.cancel',
      componentId: 'controller',
      label: 'Cancel',
      when: ['active', 'held'],
      qualification: qualified,
      confirms: 'acknowledgement',
      outcome: { motion: 'halts', spindle: 'none', heaters: 'off', position: 'kept', recovery: [] },
    }),
    standardMachineAction({
      id: 'motion.home',
      componentId: 'motion',
      label: 'Home',
      when: ['ready'],
      confirms: 'none',
    }),
  ],
  holds: [machineJogHold({ componentId: 'motion', lease: 200, bound: 500, qualification: qualified })],
  jobs: {
    type: 'supported',
    accepts: [
      {
        contract: { id: 'fixture.gcode', version: 1 },
        mediaType: 'text/x.gcode',
        requiredMembers: [],
        payloadSelection: 'single',
        technology: 'additive.fff',
      },
    ],
    delivery: 'stored',
    start: 'remote',
    attestations: [{ id: 'work-area-clear', label: 'The plate is clear.' }],
    safety: { attended: false, interlocks: [] },
  },
  stop: { motion: 'halts', spindle: 'none', heaters: 'off', position: 'may-be-lost', recovery: [] },
  observations: [
    { group: 'state', label: 'State', staleAfter: 15_000, delivery: 'retained' },
    { group: 'accessories', label: 'Accessories', staleAfter: 15_000, delivery: 'retained' },
    { group: 'position', label: 'Position', staleAfter: 1000, delivery: 'latest' },
  ],
  qualifications: [
    {
      id: 'fixture-simulation',
      environment: 'simulation',
      model: 'Fixture printer',
      firmware: [],
      attachments: [],
      evidence: 'The runtime machine tests.',
    },
  ],
};

/** The fixture's serializable manifest, as every surface reads it. @internal */
export const machineManifestFixture = machineManifestOf(
  machineManifestDefinitionFixture,
  machineSubmissionFixture.manifest,
);
