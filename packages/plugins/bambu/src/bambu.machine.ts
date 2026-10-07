import { defineConfiguration } from '@taucad/runtime/configuration';
import { quantity } from '@taucad/runtime/configuration/zod';
import { defineMachine } from '@taucad/runtime/machine';
import type { MachineAcceptedContainer } from '@taucad/runtime/machine';
import { quantityKinds } from '@taucad/units/quantity';
import { z } from 'zod';

import { bambuA1MiniManifest, bambuX1cManifest } from '#bambu.manifest.js';
import { bambuExternalSpoolSlot } from '#bambu.protocol.js';
import { bambuSettingsConfiguration } from '#bambu.settings.js';

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
const traySlot = traySlots(15);

/** Submission schema shared by the LAN provider and the simulator. @internal */
export const bambuSubmissionConfiguration = defineConfiguration({
  id: 'bambu.machine.submission',
  version: '1.2.0',
  schema: z.object({
    amsMapping: z.array(traySlots(15, -1)).max(16).default([]),
    bedLeveling: z.boolean().default(true),
    expectedBedType: z.string().min(1).max(64),
    expectedFilamentDiameter: quantity({
      unit: 'mm',
      quantityKind: quantityKinds.diameter,
      space: 'linear',
    }).positive(),
    expectedMaterials: z
      .array(z.strictObject({ slot: traySlot, materialId: z.string().min(1).max(128) }))
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

/** The one container contract the X1C accepts. @internal */
export const bambuAcceptedContainers: readonly MachineAcceptedContainer[] = [
  {
    contract: { id: 'manufacturing.toolpath.bambu-gcode-3mf', version: 1 },
    mediaType: 'application/vnd.bambulab.gcode-3mf',
    requiredMembers: ['Metadata/plate_1.gcode'],
    payloadSelection: 'plate',
    technology: 'additive.fff',
  },
];

/** `bambu` physical-machine capability. @public */
export const bambuMachine = defineMachine({
  id: 'bambu',
  name: 'Bambu Lab Developer LAN',
  version: '1.0.0',
  protocolVersion: 1,
  vendor: 'Bambu Lab',
  technologies: ['additive.fff'],
  accepts: bambuAcceptedContainers,
  manifest: bambuX1cManifest,
  bindingConfiguration,
  settingsConfiguration: bambuSettingsConfiguration,
  submissionConfiguration: bambuSubmissionConfiguration,
  async *discover(input, runtime) {
    const { discoverBambuMachines } = await import('#bambu.host.js');
    yield* discoverBambuMachines(input, runtime);
  },
  async connect(input, runtime) {
    const { connectBambuMachine } = await import('#bambu.host.js');
    return connectBambuMachine(input, runtime);
  },
});

/** A1 mini physical-machine capability, sharing the pinned Bambu LAN controller.
 * @public
 */
export const bambuA1MiniMachine = defineMachine({
  id: 'bambu-a1-mini',
  name: 'Bambu Lab A1 mini LAN',
  version: '1.0.0',
  protocolVersion: 1,
  vendor: 'Bambu Lab',
  technologies: ['additive.fff'],
  accepts: bambuAcceptedContainers,
  manifest: bambuA1MiniManifest,
  bindingConfiguration,
  settingsConfiguration: bambuSettingsConfiguration,
  submissionConfiguration: defineConfiguration({
    id: 'bambu.a1-mini.submission',
    version: '1.0.0',
    schema: bambuSubmissionConfiguration.schema.extend({
      expectedModel: z.literal('A1 mini'),
      amsMapping: z.array(traySlots(3, -1)).max(4).default([]),
      expectedMaterials: z
        .array(
          z.strictObject({
            slot: traySlots(3),
            materialId: z.string().min(1).max(128),
          }),
        )
        .min(1)
        .max(4),
    }),
    ui: { version: 1, rjsf: {} },
  }),
  async *discover(input, runtime) {
    const { discoverBambuMachines } = await import('#bambu.host.js');
    yield* discoverBambuMachines(input, runtime, 'A1 mini');
  },
  async connect(input, runtime) {
    const { connectBambuMachine } = await import('#bambu.host.js');
    return connectBambuMachine(input, runtime, 'A1 mini');
  },
});
